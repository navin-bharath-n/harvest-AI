import cv2
import numpy as np
import logging
import os
from collections import deque
import mediapipe as mp
from ultralytics import YOLO
from deep_sort_realtime.deepsort_tracker import DeepSort

import warnings
warnings.filterwarnings("ignore", message=".*weights_only.*", category=FutureWarning)

logger = logging.getLogger(__name__)

# ── MediaPipe Solutions Configuration ──────────────────
_MP_AVAILABLE = hasattr(mp, "solutions") and hasattr(mp.solutions, "face_mesh")
if not _MP_AVAILABLE:
    logger.warning(
        f"mediapipe {mp.__version__} does not expose mp.solutions.face_mesh. "
        "Face-based active-speaker detection disabled. Install mediapipe==0.10.14 to re-enable."
    )
else:
    logger.info("MediaPipe face_mesh loaded successfully.")

# ── YOLO + DeepSort Configuration ───────────────────────────────────────────────
_YOLO_AVAILABLE = True
logger.info("YOLO + DeepSort loaded successfully.")


class SmartCroppingService:
    def __init__(self):
        # ── GPU / CUDA Device Detection ──────────────────────────────────────
        self.device = "cpu"
        try:
            import torch
            if torch.cuda.is_available():
                self.device = "cuda"
                logger.info(f"GPU detected ({torch.cuda.get_device_name(0)}). Using CUDA acceleration for smart cropping.")
        except ImportError:
            pass

        # ── YOLO / DeepSort ──────────────────────────────────────────────────
        if _YOLO_AVAILABLE:
            try:
                # yolo11n.pt lives in the backend/ root directory
                _backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
                yolo_model_path = os.path.join(_backend_dir, "yolo11n.pt")
                self.yolo = YOLO(yolo_model_path)
                if self.device == "cuda":
                    self.yolo.to("cuda")
                self.tracker = DeepSort(max_age=30, n_init=3, nms_max_overlap=1.0)
            except Exception as e:
                logger.warning(f"YOLO model load failed ({e}). Using face-center fallback.")
                self.yolo = None
                self.tracker = None
        else:
            self.yolo = None
            self.tracker = None

        # ── MediaPipe Face Mesh ──────────────────────────────────────────────
        if _MP_AVAILABLE:
            self.mp_face_mesh = mp.solutions.face_mesh
        else:
            self.mp_face_mesh = None

        # MAR (Mouth Aspect Ratio) tracking for active-speaker detection
        self.mar_history = {}
        self.mar_window_size = 15

    def _calculate_mar(self, face_landmarks, frame_height: int) -> float:
        """Mouth Aspect Ratio — measures lip opening to detect speech."""
        upper_lip = face_landmarks.landmark[13]
        lower_lip = face_landmarks.landmark[14]
        return abs((lower_lip.y - upper_lip.y) * frame_height)

    def generate_crop_metadata(self, video_path: str, target_fps: int = 5) -> dict:
        """
        Processes video to generate 9:16 smooth crop coordinates.

        Pipeline (each layer is optional and degrades gracefully):
          1. YOLO person detection + DeepSort tracking  (needs ultralytics)
          2. MediaPipe active-speaker detection via MAR (needs mediapipe <= 0.10.14)
          3. Centre-crop fallback if neither is available
        """
        if not os.path.exists(video_path):
            raise FileNotFoundError(f"Video file not found: {video_path}")

        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
        width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

        # 9:16 crop window dimensions
        target_aspect = 9 / 16
        crop_width = int(height * target_aspect)
        if crop_width > width:
            crop_width = width
            crop_height = int(width / target_aspect)
        else:
            crop_height = height

        frame_skip = max(1, int(fps / target_fps))
        crop_trajectory = []

        # Exponential Moving Average centre (lower alpha = smoother, more lag)
        smooth_cx = width  / 2
        smooth_cy = height / 2
        alpha = 0.2

        frame_idx = 0

        def _process_frames(face_mesh_ctx=None):
            """Inner loop — runs with or without a face_mesh context."""
            nonlocal smooth_cx, smooth_cy, frame_idx

            while cap.isOpened():
                ret, frame = cap.read()
                if not ret:
                    break

                if frame_idx % frame_skip != 0:
                    frame_idx += 1
                    continue

                timestamp = frame_idx / fps
                tracks     = []
                detections = []

                # ── 1. YOLO Detection ────────────────────────────────────────
                if self.yolo is not None:
                    try:
                        results = self.yolo(frame, device=self.device, classes=[0], verbose=False)
                        for r in results:
                            for box in r.boxes:
                                x1, y1, x2, y2 = box.xyxy[0].cpu().numpy()
                                conf = float(box.conf[0])
                                detections.append(([x1, y1, x2 - x1, y2 - y1], conf, "person"))
                    except Exception as e:
                        logger.debug(f"YOLO detection error on frame {frame_idx}: {e}")

                # ── 2. DeepSort Tracking ─────────────────────────────────────
                if self.tracker is not None and detections:
                    try:
                        tracks = self.tracker.update_tracks(detections, frame=frame)
                    except Exception as e:
                        logger.debug(f"DeepSort error on frame {frame_idx}: {e}")

                # ── 3. Active Speaker Detection (MediaPipe) ──────────────────
                active_speaker_id = None
                max_variance = 0.0

                if face_mesh_ctx is not None:
                    try:
                        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                        fm_results = face_mesh_ctx.process(rgb_frame)

                        if fm_results.multi_face_landmarks:
                            for face_landmarks in fm_results.multi_face_landmarks:
                                h, w, _ = frame.shape
                                cx_face = int(face_landmarks.landmark[1].x * w)
                                cy_face = int(face_landmarks.landmark[1].y * h)
                                mar     = self._calculate_mar(face_landmarks, h)

                                matched_track_id = None
                                for track in tracks:
                                    if not track.is_confirmed():
                                        continue
                                    ltrb = track.to_ltrb()
                                    if ltrb[0] <= cx_face <= ltrb[2] and ltrb[1] <= cy_face <= ltrb[3]:
                                        matched_track_id = track.track_id
                                        break

                                if matched_track_id:
                                    if matched_track_id not in self.mar_history:
                                        self.mar_history[matched_track_id] = deque(maxlen=self.mar_window_size)
                                    self.mar_history[matched_track_id].append(mar)

                                    if len(self.mar_history[matched_track_id]) > 5:
                                        variance = np.var(self.mar_history[matched_track_id])
                                        if variance > max_variance:
                                            max_variance = variance
                                            active_speaker_id = matched_track_id
                    except Exception as e:
                        logger.debug(f"MediaPipe error on frame {frame_idx}: {e}")

                # ── 4. Select Target & Calculate Crop ────────────────────────
                target_box = None

                if active_speaker_id and max_variance > 1.0:
                    for track in tracks:
                        if track.track_id == active_speaker_id:
                            target_box = track.to_ltrb()
                            break

                if target_box is None:
                    max_area = 0
                    for track in tracks:
                        if not track.is_confirmed():
                            continue
                        ltrb = track.to_ltrb()
                        area = (ltrb[2] - ltrb[0]) * (ltrb[3] - ltrb[1])
                        if area > max_area:
                            max_area = area
                            target_box = ltrb

                if target_box is not None:
                    total_frame_area = max(1, width * height)
                    box_area = (target_box[2] - target_box[0]) * (target_box[3] - target_box[1])
                    # Only track if subject occupies meaningful frame area (> 2.5% of frame)
                    # Prevents jittery tracking of tiny corner webcams, icons, or slide avatars
                    if box_area >= 0.025 * total_frame_area:
                        cx = (target_box[0] + target_box[2]) / 2
                        cy = (target_box[1] + target_box[3]) / 2
                        smooth_cx = alpha * cx + (1 - alpha) * smooth_cx
                        smooth_cy = alpha * cy + (1 - alpha) * smooth_cy
                    else:
                        smooth_cx = alpha * (width / 2) + (1 - alpha) * smooth_cx
                        smooth_cy = alpha * (height / 2) + (1 - alpha) * smooth_cy
                else:
                    # Drift smoothly to center for presentations / screen recordings
                    smooth_cx = alpha * (width / 2) + (1 - alpha) * smooth_cx
                    smooth_cy = alpha * (height / 2) + (1 - alpha) * smooth_cy

                # Constrain crop window to frame bounds
                crop_x1 = max(0, int(smooth_cx - crop_width  / 2))
                crop_y1 = max(0, int(smooth_cy - crop_height / 2))

                if crop_x1 + crop_width  > width:  crop_x1 = width  - crop_width
                if crop_y1 + crop_height > height: crop_y1 = height - crop_height

                crop_trajectory.append({
                    "timestamp": round(timestamp, 2),
                    "x":         int(crop_x1),
                    "y":         int(crop_y1),
                    "width":     int(crop_width),
                    "height":    int(crop_height),
                    "target_id": active_speaker_id if active_speaker_id else "fallback",
                })

                frame_idx += 1

        # Run with or without MediaPipe
        if _MP_AVAILABLE and self.mp_face_mesh is not None:
            try:
                with self.mp_face_mesh.FaceMesh(
                    max_num_faces=5,
                    refine_landmarks=True,
                    min_detection_confidence=0.5,
                    min_tracking_confidence=0.5,
                ) as face_mesh:
                    _process_frames(face_mesh_ctx=face_mesh)
            except Exception as e:
                logger.warning(f"MediaPipe FaceMesh context failed ({e}). Re-running without face detection.")
                cap.release()
                cap = cv2.VideoCapture(video_path)
                frame_idx = 0
                smooth_cx, smooth_cy = width / 2, height / 2
                _process_frames(face_mesh_ctx=None)
        else:
            _process_frames(face_mesh_ctx=None)

        cap.release()
        logger.info(f"Generated {len(crop_trajectory)} crop keyframes at ~{target_fps} FPS.")
        return {"trajectory": crop_trajectory}


smart_cropping_service = SmartCroppingService()
