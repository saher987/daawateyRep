import os

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import CurrentUser, get_current_user

app = FastAPI(title="daawatey backend")

_allowed_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
def healthz() -> dict[str, str]:
    """Liveness check used by Cloud Run and local dev."""
    return {"status": "ok"}


@app.get("/api/me")
def me(user: CurrentUser = Depends(get_current_user)) -> dict[str, str | None]:
    """Returns the identity derived from the verified Firebase ID token —
    proof that login works end-to-end."""
    return {"uid": user.uid, "email": user.email}
