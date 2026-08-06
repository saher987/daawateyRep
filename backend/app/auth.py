"""Firebase ID token verification.

Every protected route depends on `get_current_user`, which verifies the
caller's Firebase ID token via the Admin SDK and returns the identity it
finds *in the verified token*. Nothing here ever trusts a user id, email,
or role supplied by the client in the request body, query params, or any
other header — that would let a client impersonate anyone.
"""

from dataclasses import dataclass

import firebase_admin
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth

# Uses Application Default Credentials: the attached service account on
# Cloud Run, or `gcloud auth application-default login` for local dev.
# No service account key file is committed to this repo.
if not firebase_admin._apps:
    firebase_admin.initialize_app()

_bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    uid: str
    email: str | None


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> CurrentUser:
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
        )

    try:
        decoded = firebase_auth.verify_id_token(credentials.credentials)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc

    return CurrentUser(uid=decoded["uid"], email=decoded.get("email"))
