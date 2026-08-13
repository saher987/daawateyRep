"""File uploads (Core.UploadFile in the original — profile photos, event
cover/invitation images, venue images, generated invitation-card PNGs; see
BUSINESS_LOGIC.md). Real Cloud Storage, replacing the base64-data-URL
stand-in base44Client.js used until now.

Uses the project's own Firebase Storage bucket (`{project}.firebasestorage
.app` — see app/auth.py's firebase_admin.initialize_app options) rather
than provisioning a separate GCS bucket: same project, same naming already
confirmed for the frontend's VITE_FIREBASE_STORAGE_BUCKET, no new bucket to
create or wire up. Requires two one-time steps the app can't do for itself
(see DEPLOYMENT.md): enabling Cloud Storage for Firebase in the console
(provisions the default bucket), and granting the backend runtime service
account write access to it.

Any signed-in user can upload — same as the original, where UploadFile
itself carried no role check; only what a page later *does* with the
resulting URL is permission-checked (e.g. only an event's owner/manager
can actually save it onto that event)."""

import logging
import os
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from firebase_admin import storage as firebase_storage

from app import models
from app.auth import get_app_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["uploads"])

# Generous enough for a phone photo or a generated invitation-card PNG,
# small enough that one runaway upload can't meaningfully bloat storage
# costs or hold a Cloud Run request open. Not configurable — if it turns
# out too small in practice, raise it here rather than adding another env
# var for something that isn't actually varying per environment.
_MAX_UPLOAD_BYTES = 15 * 1024 * 1024

# An explicit allowlist, not `content_type.startswith("image/")` — that
# prefix check let `image/svg+xml` through too. SVG is XML, so an "image"
# upload could carry a `<script>` payload; served back from a public,
# world-readable bucket URL (see below) with that same content-type, a
# browser executes it on direct navigation to the link. Every format here
# is a real raster/vector-without-script format the app's own upload UI
# (profile photo, event cover/invitation image, generated invitation-card
# PNG) actually produces — nothing legitimate is lost by dropping svg+xml.
_ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}


@router.post("/uploads")
async def upload_file(
    file: UploadFile,
    _: models.User = Depends(get_app_user),
) -> dict:
    if file.content_type not in _ALLOWED_CONTENT_TYPES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Only image uploads are supported")

    body = await file.read()
    if len(body) > _MAX_UPLOAD_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="File too large")

    ext = os.path.splitext(file.filename or "")[1] or ""
    blob_name = f"uploads/{uuid.uuid4().hex}{ext}"

    try:
        bucket = firebase_storage.bucket()
        blob = bucket.blob(blob_name)
        blob.upload_from_string(body, content_type=file.content_type)
        # NOT blob.make_public(): that uses the legacy per-object ACL API,
        # which fails outright on a bucket with uniform bucket-level access
        # enabled — the default for buckets Firebase Storage provisions via
        # its "Get started" console flow. Public read is granted once at
        # the bucket level via IAM instead (see BUSINESS_LOGIC.md §6:
        # `allUsers` / `roles/storage.objectViewer`); `blob.public_url` just
        # formats the URL string client-side, no API call, so it's safe to
        # use unconditionally once that IAM binding exists.
    except Exception:
        # Covers both "bucket doesn't exist yet" (Cloud Storage for Firebase
        # never enabled in the console) and any transient GCS/IAM failure —
        # either way this request can't succeed, and the caller needs a
        # real error to show, not a silently-missing image like the
        # degrade-gracefully pattern used for SMS/email elsewhere.
        logger.exception("Upload to Firebase Storage failed for %s", blob_name)
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, detail="File storage is not available right now"
        ) from None

    return {"file_url": blob.public_url}
