import cv2
import numpy as np
import subprocess
import os
import uuid
import logging

logger = logging.getLogger(__name__)

class ClipRenderingService:
    def render_clip(self, video_path: str, output_path: str, start_time: float, end_time: float, crop_trajectory: list, editing_instructions: dict = None, subtitle_path: str = None):
        """
        Renders a 1080x1920 crop of the video from start_time to end_time,
        dynamically moving the crop window based on crop_trajectory.
        Muxes with original AAC audio. Applies editing instructions like zooms and on-the-fly subtitle burning.
        """
        if editing_instructions is None:
            editing_instructions = {}

        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found: {video_path}")

        duration = end_time - start_time
        if duration <= 0:
            raise ValueError("End time must be greater than start time")

        # 1. Trim the video clip first using FFmpeg to avoid inaccurate OpenCV seeking.
        temp_trimmed_path = output_path.replace(".mp4", f"_trimmed_{uuid.uuid4().hex[:8]}.mp4")
        temp_video_path = output_path.replace(".mp4", f"_temp_{uuid.uuid4().hex[:8]}.mp4")
        
        cap = None
        process = None
        safe_sub_path = None
        temp_sub_path = None

        try:
            # High-quality near-lossless trim with minimal logs
            trim_cmd = [
                'ffmpeg', '-y',
                '-loglevel', 'error',
                '-ss', str(start_time),
                '-t', str(duration),
                '-i', video_path,
                '-map', '0:v:0',
                '-map', '0:a:0?',
                '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '12',
                '-c:a', 'aac',
                temp_trimmed_path
            ]
            
            logger.info(f"Trimming video to avoid seek issues. Command: {' '.join(trim_cmd)}")
            trim_process = subprocess.run(trim_cmd, capture_output=True, text=True)
            if trim_process.returncode != 0:
                logger.error(f"Trimming failed: {trim_process.stderr}")
                raise RuntimeError(f"Trimming failed: {trim_process.stderr}")

            # 2. Open trimmed video in OpenCV and read sequentially from frame 0
            cap = cv2.VideoCapture(temp_trimmed_path)
            fps = cap.get(cv2.CAP_PROP_FPS)
            if fps == 0:
                fps = 30.0 # Fallback
                
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            
            # Target Shorts resolution
            target_w, target_h = 1080, 1920

            # Prepare subtitles filter if subtitle path is provided
            filters = []
            if subtitle_path and os.path.exists(subtitle_path):
                import shutil
                ext = os.path.splitext(subtitle_path)[1]
                temp_sub_name = f"_tmp_sub_{uuid.uuid4().hex[:8]}{ext}"
                # Copy to current working directory to avoid any Windows drive letter colon and escaping issues in FFmpeg filters
                temp_sub_path = os.path.join(os.getcwd(), temp_sub_name)
                shutil.copy2(subtitle_path, temp_sub_path)
                safe_sub_path = temp_sub_name
                filters.append(f"subtitles='{safe_sub_path}'")

            # FFmpeg command to read raw frames from stdin and encode to H264
            ffmpeg_cmd = [
                'ffmpeg',
                '-y', # Overwrite
                '-loglevel', 'error', # Crucial: prevents stderr buffer from filling and causing a deadlock
                '-f', 'rawvideo',
                '-vcodec', 'rawvideo',
                '-s', f'{target_w}x{target_h}',
                '-pix_fmt', 'bgr24',
                '-r', str(fps),
                '-i', '-', # Input from stdin
            ]
            if filters:
                ffmpeg_cmd.extend(['-vf', ','.join(filters)])
                
            ffmpeg_cmd.extend([
                '-c:v', 'libx264',
                '-preset', 'fast',
                '-crf', '18', # Visually lossless high-quality video encoding
                '-pix_fmt', 'yuv420p',
                temp_video_path
            ])

            logger.info(f"Starting frame processing. FFmpeg command: {' '.join(ffmpeg_cmd)}")
            process = subprocess.Popen(ffmpeg_cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)

            current_frame = 0
            fade_duration = 0.5  # 0.5 seconds fade duration
            fade_frames = max(1, int(fade_duration * fps))
            total_clip_frames = int(duration * fps)

            while True:
                ret, frame = cap.read()
                if not ret:
                    break
                    
                timestamp = start_time + (current_frame / fps)
                clip_frame_idx = current_frame
                
                # Find corresponding crop coordinate
                current_crop = crop_trajectory[0]
                for crop in crop_trajectory:
                    if crop["timestamp"] <= timestamp:
                        current_crop = crop
                    else:
                        break
                        
                crop_x = int(current_crop["x"])
                crop_y = int(current_crop["y"])
                crop_w = int(current_crop["width"])
                crop_h = int(current_crop["height"])

                # Apply zooms if requested
                zoom_instruction = editing_instructions.get("zooms", "none")
                if zoom_instruction in ["frequent", "subtle"]:
                    zoom_factor = 1.0 - (0.15 * (current_frame / (total_clip_frames or 1)))
                    new_w = int(crop_w * zoom_factor)
                    new_h = int(crop_h * zoom_factor)
                    crop_x += (crop_w - new_w) // 2
                    crop_y += (crop_h - new_h) // 2
                    crop_w, crop_h = new_w, new_h
                
                # Apply transition zoom scale if requested
                transition_style = editing_instructions.get("transition", "fade")
                if transition_style == "zoom" and total_clip_frames > 2 * fade_frames:
                    if clip_frame_idx < fade_frames:
                        progress = clip_frame_idx / fade_frames
                        t_factor = 1.25 - 0.25 * progress  # Zoom out at start
                    elif clip_frame_idx > total_clip_frames - fade_frames:
                        progress = (clip_frame_idx - (total_clip_frames - fade_frames)) / fade_frames
                        t_factor = 1.0 + 0.25 * progress  # Zoom in at end
                    else:
                        t_factor = 1.0
                    
                    if t_factor != 1.0:
                        new_w = int(crop_w * (1.0 / t_factor))
                        new_h = int(crop_h * (1.0 / t_factor))
                        crop_x += (crop_w - new_w) // 2
                        crop_y += (crop_h - new_h) // 2
                        crop_w, crop_h = new_w, new_h

                # Ensure bounds
                crop_x = max(0, min(crop_x, width - crop_w))
                crop_y = max(0, min(crop_y, height - crop_h))
                
                # Crop
                cropped_frame = frame[crop_y:crop_y+crop_h, crop_x:crop_x+crop_w]
                
                # Resize to 1080x1920
                resized_frame = cv2.resize(cropped_frame, (target_w, target_h), interpolation=cv2.INTER_LINEAR)
                
                # Apply fade transition if requested
                if transition_style == "fade" and total_clip_frames > 2 * fade_frames:
                    if clip_frame_idx < fade_frames:
                        alpha = clip_frame_idx / fade_frames
                        resized_frame = (resized_frame * alpha).astype(np.uint8)
                    elif clip_frame_idx > total_clip_frames - fade_frames:
                        alpha = (total_clip_frames - clip_frame_idx) / fade_frames
                        resized_frame = (resized_frame * alpha).astype(np.uint8)

                # Write to FFmpeg stdin
                process.stdin.write(resized_frame.tobytes())
                current_frame += 1

            # Close stdin to signal end of stream
            process.stdin.close()
            process.wait()

            if process.returncode != 0:
                stderr = process.stderr.read().decode()
                logger.error(f"FFmpeg encoding failed: {stderr}")
                raise RuntimeError(f"FFmpeg encoding failed: {stderr}")

            logger.info(f"Finished frame processing. Muxing audio...")
            
            # Mux with trimmed audio + apply faststart flag for web streaming
            mux_cmd = [
                'ffmpeg',
                '-y',
                '-i', temp_video_path,
                '-i', temp_trimmed_path,
                '-c:v', 'copy',
                '-c:a', 'aac',
                '-b:a', '192k',
                '-map', '0:v:0',
                '-map', '1:a:0?', # The ? allows it to succeed even if video has no audio
                '-movflags', '+faststart',
                output_path
            ]
            
            mux_process = subprocess.run(mux_cmd, capture_output=True, text=True)
            if mux_process.returncode != 0:
                logger.error(f"Audio muxing failed: {mux_process.stderr}")
                raise RuntimeError(f"Audio muxing failed: {mux_process.stderr}")
                
            logger.info(f"Successfully rendered clip to {output_path}")
            return output_path

        except Exception as e:
            logger.error(f"Error during render_clip: {e}")
            if process and process.poll() is None:
                process.terminate()
            raise e

        finally:
            if cap:
                cap.release()
            # Clean up temp subtitle copy
            if temp_sub_path and os.path.exists(temp_sub_path):
                try:
                    os.remove(temp_sub_path)
                except Exception:
                    pass
            # Clean up temp files
            for path in [temp_trimmed_path, temp_video_path]:
                if os.path.exists(path):
                    try:
                        os.remove(path)
                    except Exception as ex:
                        logger.warning(f"Failed to remove temp file {path}: {ex}")

clip_rendering_service = ClipRenderingService()
