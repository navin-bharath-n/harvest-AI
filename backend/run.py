import os
import sys
import uvicorn
from generate_certs import generate_self_signed_cert

if __name__ == "__main__":
    backend_dir = os.path.abspath(os.path.dirname(__file__))
    sys.path.insert(0, backend_dir)
    
    key_path = os.path.join(backend_dir, "key.pem")
    cert_path = os.path.join(backend_dir, "cert.pem")
    
    if not os.path.exists(key_path) or not os.path.exists(cert_path):
        generate_self_signed_cert(backend_dir)
        
    ssl_kwargs = {}
    if os.path.exists(key_path) and os.path.exists(cert_path):
        ssl_kwargs = {"ssl_keyfile": key_path, "ssl_certfile": cert_path}
        print(f"[HTTPS] Starting HarvestAI Backend on https://localhost:8000 (SSL Enabled)")
    else:
        print("[HTTP] Warning: SSL certs not found, running on http://localhost:8000")

    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True, **ssl_kwargs)
