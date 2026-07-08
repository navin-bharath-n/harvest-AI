# Init app module
try:
    import torch
    if torch.cuda.is_available():
        # Pre-initialize CUDA to prevent cuDNN DLL conflicts with ctranslate2 (faster-whisper) on Windows
        _ = torch.rand(1, 1).cuda()
except Exception:
    pass
