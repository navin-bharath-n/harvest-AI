import subprocess
import json
import os
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Absolute path to the uploads dir — always same regardless of CWD
_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent  # backend/
_DEFAULT_UPLOAD_DIR = _BACKEND_DIR / "app" / "uploads"

class VideoProcessor:
    def __init__(self, upload_dir: str = None):
        self.upload_dir = Path(upload_dir) if upload_dir else _DEFAULT_UPLOAD_DIR
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        
    def process(self, video_path: str) -> dict:
        video_path = Path(video_path)
        if not video_path.exists():
            raise FileNotFoundError(f"Video file not found: {video_path}")
            
        logger.info(f"Processing video: {video_path}")
        
        # 1. Get metadata with ffprobe
        metadata = self._get_metadata(video_path)
        
        # Create a specific directory for this video's assets
        base_name = video_path.stem
        video_assets_dir = self.upload_dir / base_name
        video_assets_dir.mkdir(exist_ok=True)
        
        # 2. Extract Audio
        audio_path = video_assets_dir / f"{base_name}_audio.wav"
        self._extract_audio(video_path, audio_path)
        
        # 3. Extract Frames
        frames_dir = video_assets_dir / "frames"
        frames_dir.mkdir(exist_ok=True)
        self._extract_frames(video_path, frames_dir)
        
        # 4. Generate 15-second Short
        short_path = video_assets_dir / f"{base_name}_short.mp4"
        self._generate_short(video_path, short_path)
        
        return {
            "duration": metadata.get("duration"),
            "resolution": metadata.get("resolution"),
            "fps": metadata.get("fps"),
            "bitrate": metadata.get("bitrate"),
            "audio_path": str(audio_path),
            "frame_directory": str(frames_dir),
            "short_path": str(short_path)
        }
        
    def _get_metadata(self, video_path: Path) -> dict:
        cmd = [
            "ffprobe",
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,r_frame_rate,duration,bit_rate",
            "-of", "json",
            str(video_path)
        ]
        
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, check=True)
            data = json.loads(result.stdout)
            
            if not data.get("streams"):
                return {}
                
            stream = data["streams"][0]
            
            # Parse fps (usually like "30000/1001" or "30/1")
            fps = None
            if "r_frame_rate" in stream:
                num, den = stream["r_frame_rate"].split('/')
                if den != '0':
                    fps = round(float(num) / float(den), 2)
            
            resolution = f"{stream.get('width', '')}x{stream.get('height', '')}"
            duration = float(stream.get("duration", 0)) if "duration" in stream else None
            bitrate = stream.get("bit_rate")
            
            return {
                "duration": duration,
                "resolution": resolution,
                "fps": fps,
                "bitrate": bitrate
            }
        except subprocess.CalledProcessError as e:
            logger.error(f"FFprobe error: {e.stderr}")
            return {}
        except Exception as e:
            logger.error(f"Error extracting metadata: {e}")
            return {}
            
    def _extract_audio(self, video_path: Path, output_path: Path):
        cmd = [
            "ffmpeg",
            "-y",  # overwrite output
            "-i", str(video_path),
            "-q:a", "0",
            "-map", "a",
            str(output_path)
        ]
        try:
            subprocess.run(cmd, capture_output=True, check=True)
        except subprocess.CalledProcessError as e:
            logger.error(f"FFmpeg audio extraction error: {e.stderr}")
            # If the video has no audio, ffmpeg will fail. This is ok.
            pass
            
    def _extract_frames(self, video_path: Path, output_dir: Path):
        cmd = [
            "ffmpeg",
            "-y",
            "-i", str(video_path),
            "-vf", "fps=1",
            str(output_dir / "frame_%04d.jpg")
        ]
        try:
            subprocess.run(cmd, capture_output=True, check=True)
        except subprocess.CalledProcessError as e:
            logger.error(f"FFmpeg frame extraction error: {e.stderr}")
            raise
            
    def _generate_short(self, video_path: Path, output_path: Path):
        cmd = [
            "ffmpeg",
            "-y",
            "-i", str(video_path),
            "-t", "15",
            "-c:v", "libx264",
            "-preset", "veryfast",
            "-c:a", "aac",
            "-movflags", "+faststart",
            str(output_path)
        ]
        try:
            logger.info(f"Generating short clip for {video_path}")
            subprocess.run(cmd, capture_output=True, check=True)
        except subprocess.CalledProcessError as e:
            logger.error(f"FFmpeg short generation error: {e.stderr}")
            raise
