"""Local uvicorn launcher.

Keeps the default asyncio policy (stable on Windows); on Linux, uvloop is
picked up automatically by uvicorn[standard]. Production deployments should
run behind gunicorn/uvicorn workers on Linux.
"""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

if __name__ == "__main__":
    import os

    import uvicorn

    uvicorn.run("backend.main:app", host="127.0.0.1",
                port=int(os.getenv("PORT", "8000")), log_level="warning")
