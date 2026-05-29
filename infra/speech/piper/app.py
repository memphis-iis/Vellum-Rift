import os

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel


app = FastAPI(title="vellum-rift-piper")


class SynthesisRequest(BaseModel):
    text: str
    voice: str | None = None


@app.get("/healthz")
def healthz():
    return {
        "status": "ok",
        "service": "piper",
        "default_voice": os.getenv("PIPER_DEFAULT_VOICE", "en_US-lessac-medium")
    }


@app.post("/synthesize")
def synthesize(request: SynthesisRequest):
    raise HTTPException(
        status_code=501,
        detail=(
            "Piper model serving is scaffolded for local development, but voice model installation "
            "and synthesis wiring still need to be implemented."
        )
    )
