import os
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

try:
    from faster_whisper import WhisperModel
except Exception:  # pragma: no cover
    WhisperModel = None


app = FastAPI(title="vellum-rift-faster-whisper")
_model = None


class TranscriptionRequest(BaseModel):
    audio_path: str
    language: Optional[str] = None
    beam_size: int = 1


def get_model():
    global _model

    if WhisperModel is None:
        raise RuntimeError("faster-whisper is not available in this container")

    if _model is None:
        _model = WhisperModel(
            os.getenv("FASTER_WHISPER_MODEL", "small"),
            device=os.getenv("FASTER_WHISPER_DEVICE", "cpu"),
            compute_type=os.getenv("FASTER_WHISPER_COMPUTE_TYPE", "int8")
        )

    return _model


@app.get("/healthz")
def healthz():
    return {
        "status": "ok",
        "service": "faster-whisper",
        "model": os.getenv("FASTER_WHISPER_MODEL", "small")
    }


@app.post("/transcribe")
def transcribe(request: TranscriptionRequest):
    if not os.path.exists(request.audio_path):
        raise HTTPException(status_code=400, detail="audio_path does not exist inside the container")

    model = get_model()
    segments, info = model.transcribe(
        request.audio_path,
        language=request.language,
        beam_size=request.beam_size
    )
    text = "".join(segment.text for segment in segments).strip()

    return {
        "text": text,
        "language": getattr(info, "language", request.language),
        "duration": getattr(info, "duration", None)
    }
