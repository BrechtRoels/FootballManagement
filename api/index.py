"""Vercel serverless entrypoint for the FastAPI backend.

The backend code lives in `backend/` (bundled via `includeFiles` in the root
`vercel.json`); add it to the path so its `from app...` imports resolve, then
re-export the ASGI `app` for Vercel's Python runtime. `vercel.json` rewrites
every `/api/*` request to this function.
"""

import os
import sys

sys.path.insert(
    0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "backend")
)

from app.main import app  # noqa: E402,F401  (re-exported for the Vercel runtime)
