"""ASGI entrypoint shim so `uvicorn main:app` works from the project root."""

from backend.main import app
