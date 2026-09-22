import os
import sys
import uvicorn
from generate_certs import generate_self_signed_cert

if __name__ == "__main__":
    backend_dir = os.path.abspath(os.path.dirname(__file__))
    sys.path.insert(0, backend_dir)
    
    key_path = os.path.join(backend_dir, "key.pem")
    cert_path = os.path.join(backend_dir, "cert.pem")
    
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    use_ssl = os.environ.get("USE_SSL", "true").lower() == "true"
    reload_enabled = os.environ.get("DEV_RELOAD", os.environ.get("RELOAD", "false")).lower() == "true"

    ssl_kwargs = {}
    if use_ssl:
        if not os.path.exists(key_path) or not os.path.exists(cert_path):
            generate_self_signed_cert(backend_dir)
            
        if os.path.exists(key_path) and os.path.exists(cert_path):
            ssl_kwargs = {"ssl_keyfile": key_path, "ssl_certfile": cert_path}
            print(f"[HTTPS] Starting HarvestAI Backend on https://{host}:{port} (SSL Enabled)")
        else:
            print(f"[HTTP] Warning: SSL certs not found, running on http://{host}:{port}")
    else:
        print(f"[HTTP] Starting HarvestAI Backend on http://{host}:{port} (SSL Disabled / Reverse Proxy Mode)")

    uvicorn.run("app.main:app", host=host, port=port, reload=reload_enabled, **ssl_kwargs)
