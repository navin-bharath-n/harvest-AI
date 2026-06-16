import os
import logging
import numpy as np
import scipy.io.wavfile as wavfile

logger = logging.getLogger(__name__)

def detect_audio_highlights(audio_path: str, min_duration: float = 15.0, max_duration: float = 30.0, num_highlights: int = 3) -> list:
    """
    Analyzes the audio WAV file, calculates root-mean-square (RMS) energy,
    and returns list of highlight segments: [{'start': float, 'end': float, 'score': float, 'reason': str}]
    """
    if not audio_path or not os.path.exists(audio_path):
        logger.warning(f"Audio file not found for highlight analysis: {audio_path}")
        return []

    logger.info(f"Analyzing audio peaks in {audio_path} for gameplay/action highlights...")
    try:
        sample_rate, data = wavfile.read(audio_path)
        
        # If stereo, convert to mono by taking the mean of channels
        if len(data.shape) > 1:
            data = data.mean(axis=1)
            
        # Normalize data to range [-1.0, 1.0] depending on dtype
        if data.dtype == np.int16:
            data = data.astype(np.float32) / 32768.0
        elif data.dtype == np.int32:
            data = data.astype(np.float32) / 2147483648.0
        elif data.dtype == np.uint8:
            data = (data.astype(np.float32) - 128.0) / 128.0
        else:
            data = data.astype(np.float32)
            max_val = np.max(np.abs(data))
            if max_val > 0:
                data = data / max_val
            
        # Calculate RMS energy in 1-second windows
        window_size = int(sample_rate) # 1 second window
        num_windows = len(data) // window_size
        
        if num_windows <= 0:
            logger.warning("Audio file is too short to compute RMS windows.")
            return []
            
        rms_values = []
        for i in range(num_windows):
            window = data[i * window_size : (i + 1) * window_size]
            rms = np.sqrt(np.mean(window ** 2))
            rms_values.append(rms)
            
        rms_values = np.array(rms_values)
        
        # Smooth the values with a simple moving average of 3 seconds to reduce noise
        smoothed_rms = np.convolve(rms_values, np.ones(3)/3, mode='same')
        
        # Find local peaks/highest activity regions
        mean_rms = np.mean(smoothed_rms)
        std_rms = np.std(smoothed_rms)
        threshold = mean_rms + 0.5 * std_rms # Peak threshold
        
        # Find all seconds that are above the threshold
        active_seconds = np.where(smoothed_rms > threshold)[0]
        
        if len(active_seconds) == 0:
            # Fall back to sorting by volume directly if no clear peaks stand out
            sorted_indices = np.argsort(smoothed_rms)[::-1]
            active_seconds = sorted_indices[:min(len(sorted_indices), 60)]
            active_seconds = np.sort(active_seconds)
            
        # Group active seconds into contiguous segments
        segments = []
        if len(active_seconds) > 0:
            current_start = active_seconds[0]
            current_end = active_seconds[0]
            
            for sec in active_seconds[1:]:
                if sec == current_end + 1:
                    current_end = sec
                else:
                    segments.append((current_start, current_end))
                    current_start = sec
                    current_end = sec
            segments.append((current_start, current_end))
            
        # Score each segment based on max volume and average volume
        scored_segments = []
        for start_sec, end_sec in segments:
            dur = end_sec - start_sec
            
            # Clip duration to standard highlight range
            if dur < min_duration:
                # Pad segment duration to min_duration centered around the peak
                peak_sec = start_sec + np.argmax(smoothed_rms[start_sec:end_sec+1])
                start_sec = max(0, peak_sec - int(min_duration // 2))
                end_sec = start_sec + int(min_duration)
            elif dur > max_duration:
                # Trim segment duration to max_duration around the peak
                peak_sec = start_sec + np.argmax(smoothed_rms[start_sec:end_sec+1])
                start_sec = max(0, peak_sec - int(max_duration // 2))
                end_sec = start_sec + int(max_duration)
                
            segment_rms = smoothed_rms[start_sec:end_sec+1]
            if len(segment_rms) == 0:
                continue
                
            # Compute a score out of 10
            max_rms_in_segment = np.max(segment_rms)
            score = float(max_rms_in_segment * 10.0)
            # Clip score between 1.0 and 10.0
            score = max(1.0, min(10.0, score))
            
            # Avoid duplicate or heavily overlapping segments
            is_overlap = False
            for existing in scored_segments:
                overlap_start = max(start_sec, existing['start'])
                overlap_end = min(end_sec, existing['end'])
                if (overlap_end - overlap_start) > 5.0: # overlap more than 5 seconds
                    is_overlap = True
                    # Keep the one with the higher score
                    if score > existing['score']:
                        existing['start'] = float(start_sec)
                        existing['end'] = float(end_sec)
                        existing['score'] = score
                    break
                    
            if not is_overlap:
                scored_segments.append({
                    "start": float(start_sec),
                    "end": float(end_sec),
                    "score": round(score, 2),
                    "reason": "High audio intensity/action peak (detected from wave amplitude)."
                })
                
        # Sort by score descending and return top highlights
        scored_segments.sort(key=lambda x: x['score'], reverse=True)
        results = scored_segments[:num_highlights]
        logger.info(f"Audio highlight peak detection complete. Found {len(results)} candidate segments.")
        return results
        
    except Exception as e:
        logger.error(f"Error in audio highlight detection: {e}", exc_info=True)
        return []
