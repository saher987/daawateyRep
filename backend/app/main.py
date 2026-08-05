from fastapi import FastAPI

app = FastAPI(title="daawatey backend")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    """Liveness check used by Cloud Run and local dev."""
    return {"status": "ok"}
