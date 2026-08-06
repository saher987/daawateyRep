# backend

Python + FastAPI, deployed as a container on Cloud Run.

## Local development

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Then `curl localhost:8000/healthz` → `{"status": "ok"}`.

## Docker

```bash
docker build -t daawatey-backend .
docker run -p 8080:8080 daawatey-backend
```

## Auth

Every protected route verifies the caller's Firebase ID token via the Firebase
Admin SDK (`app/auth.py`, added once Firebase projects exist) and derives identity
only from the verified token — never from a client-supplied user id.
