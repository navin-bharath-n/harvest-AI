import asyncio
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from app.core.database import SessionLocal
from app import models

logger = logging.getLogger(__name__)

async def run_scheduler_loop(poll_interval: int = 20):
    """
    Periodically checks the database for clips that are scheduled to be published
    and whose scheduled_at time has arrived or passed.
    """
    logger.info(f"PublishScheduler: Started background scheduler task (poll interval: {poll_interval}s)")
    while True:
        try:
            # Run blocking database checks in a separate worker thread so event loop remains responsive
            await asyncio.to_thread(check_and_dispatch_scheduled_clips)
        except asyncio.CancelledError:
            logger.info("PublishScheduler: Scheduler received cancellation request. Exiting...")
            break
        except Exception as e:
            logger.error(f"PublishScheduler: Error during scheduled publish cycle: {e}", exc_info=True)

        try:
            await asyncio.sleep(poll_interval)
        except asyncio.CancelledError:
            logger.info("PublishScheduler: Cancelled during sleep.")
            break


def check_and_dispatch_scheduled_clips():
    """
    Queries database for clips with pending schedules whose scheduled_at <= now(UTC)
    and dispatches them to the background publisher.
    """
    db: Session = SessionLocal()
    try:
        now_utc = datetime.now(timezone.utc)
        # Fetch completed clips that have edit_options configured
        completed_clips = (
            db.query(models.Clip)
            .filter(
                models.Clip.status == models.ClipStatus.COMPLETED,
                models.Clip.edit_options.isnot(None),
            )
            .all()
        )

        due_clips = []
        for clip in completed_clips:
            if not clip.edit_options or not isinstance(clip.edit_options, dict):
                continue

            scheduled_info = clip.edit_options.get("scheduled_publish")
            if not scheduled_info or not isinstance(scheduled_info, dict):
                continue

            # Only process if status is explicitly 'scheduled'
            if scheduled_info.get("status") != "scheduled":
                continue

            scheduled_at_str = scheduled_info.get("scheduled_at")
            if not scheduled_at_str:
                continue

            try:
                # Parse ISO timestamp
                normalized_str = scheduled_at_str.replace("Z", "+00:00")
                sched_dt = datetime.fromisoformat(normalized_str)
                if sched_dt.tzinfo is None:
                    sched_dt = sched_dt.replace(tzinfo=timezone.utc)

                if sched_dt <= now_utc:
                    due_clips.append((clip, scheduled_info))
            except Exception as parse_err:
                logger.warning(
                    f"PublishScheduler: Could not parse scheduled_at '{scheduled_at_str}' for clip {clip.id}: {parse_err}"
                )

        if not due_clips:
            return

        logger.info(f"PublishScheduler: Found {len(due_clips)} clip(s) ready for scheduled publishing.")

        for clip, sched in due_clips:
            try:
                # Re-verify clip in DB to prevent duplicate worker race conditions
                db.refresh(clip)
                current_edit_opts = clip.edit_options or {}
                current_sched = current_edit_opts.get("scheduled_publish") or {}
                if current_sched.get("status") != "scheduled":
                    logger.info(f"PublishScheduler: Clip {clip.id} was already claimed by another worker. Skipping.")
                    continue

                # 1. Update status to 'publishing' immediately in DB to claim the job
                updated_sched = dict(current_sched)
                updated_sched["status"] = "publishing"
                updated_sched["triggered_at"] = now_utc.isoformat()

                edit_opts = dict(current_edit_opts)
                edit_opts["scheduled_publish"] = updated_sched
                clip.edit_options = edit_opts
                flag_modified(clip, "edit_options")
                db.commit()
                db.refresh(clip)

                logger.info(f"PublishScheduler: Dispatching publication task for clip {clip.id}...")

                # 2. Dispatch task with sanitized payload
                from app.tasks.video_tasks import publish_video_task
                from app.api.api_v1.endpoints.videos import dispatch_task

                raw_req = sched.get("request") or {}
                request_payload = {
                    "platforms": sched.get("platforms") or raw_req.get("platforms", []),
                    "title": sched.get("title") or raw_req.get("title"),
                    "description": sched.get("description") or raw_req.get("description"),
                    "privacy": sched.get("privacy") or raw_req.get("privacy", "public"),
                    "platform_configs": sched.get("platform_configs") or raw_req.get("platform_configs", {}),
                    "thumbnail_path": sched.get("thumbnail_path") or raw_req.get("thumbnail_path"),
                    "branding_config": sched.get("branding_config") or raw_req.get("branding_config"),
                    # Important: Clear scheduled_at because the scheduled time has arrived.
                    # This ensures YouTube and Meta upload and publish immediately as live without API 400 errors.
                    "scheduled_at": None,
                }

                dispatch_task(publish_video_task, clip.id, request_payload)
                logger.info(f"PublishScheduler: Successfully launched scheduled publishing for clip {clip.id}.")

            except Exception as task_err:
                logger.error(
                    f"PublishScheduler: Failed to trigger scheduled publish for clip {clip.id}: {task_err}",
                    exc_info=True,
                )
                try:
                    updated_sched = dict(sched)
                    updated_sched["status"] = "failed"
                    updated_sched["error"] = str(task_err)
                    edit_opts = dict(clip.edit_options or {})
                    edit_opts["scheduled_publish"] = updated_sched
                    clip.edit_options = edit_opts
                    flag_modified(clip, "edit_options")
                    db.commit()
                except Exception:
                    pass

    except Exception as e:
        logger.error(f"PublishScheduler: Error scanning for scheduled clips: {e}", exc_info=True)
    finally:
        db.close()
