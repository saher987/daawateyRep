"""Firebase ID token verification.

Every protected route depends on `get_current_user`, which verifies the
caller's Firebase ID token via the Admin SDK and returns the identity it
finds *in the verified token*. Nothing here ever trusts a user id, email,
or role supplied by the client in the request body, query params, or any
other header — that would let a client impersonate anyone.
"""

import logging
import os
from dataclasses import dataclass

import firebase_admin
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from firebase_admin import auth as firebase_auth

logger = logging.getLogger(__name__)

# Uses Application Default Credentials: the attached service account on
# Cloud Run (which also exposes the project via the metadata server), or
# `gcloud auth application-default login` for local dev. No service account
# key file is committed to this repo.
#
# User-login ADC (the local dev case) doesn't carry a project id the way a
# service account credential does, so it must be passed explicitly here via
# GOOGLE_CLOUD_PROJECT — otherwise verify_id_token() fails with "A project
# ID is required to access the auth service."
if not firebase_admin._apps:
    _project_id = os.environ.get("GOOGLE_CLOUD_PROJECT") or os.environ.get("GCLOUD_PROJECT")
    firebase_admin.initialize_app(options={"projectId": _project_id} if _project_id else None)

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
        # Log the real reason server-side; the client only ever gets a
        # generic 401 — never leak verification internals to the caller.
        logger.warning("Firebase ID token verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc

    return CurrentUser(uid=decoded["uid"], email=decoded.get("email"))
