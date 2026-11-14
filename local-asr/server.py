# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "faster-whisper>=1.1.0",
#   "fastapi>=0.110",
#   "uvicorn>=0.29",
#   "python-multipart>=0.0.9",
#   "numpy>=1.26",
# ]
# ///
"""Witness local ASR server — minimal OpenAI-compatible /v1/audio/transcriptions.

Runs entirely offline on CPU (CUDA auto-detected). Powered by faster-whisper.
Started by `wit local-asr start` via `uv run` — deps resolve from the inline
metadata above, cached after first run.

We decode uploads to 16 kHz mono float32 ourselves and hand faster-whisper a
numpy array — its own av.open(..., metadata_errors=...) path breaks on PyAV 19.
"""
import argparse
import io
import os
import threading

import numpy as np
import uvicorn
from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import JSONResponse, PlainTextResponse

app = FastAPI(title="witness-local-asr")
MODEL_ID = "Systran/faster-whisper-small"
_model = None
_model_error = None
_model_ready = threading.Event()


def _load():
    global _model, _model_error
    try:
        from faster_whisper import WhisperModel

        try:
            _model = WhisperModel(MODEL_ID, device="auto", compute_type="default")
        except Exception:
            _model = WhisperModel(MODEL_ID, device="cpu", compute_type="int8")
    except Exception as e:  # model download / dep failure
        _model_error = str(e)
    finally:
        _model_ready.set()


def _wait_model():
    _model_ready.wait()
    if _model is None:
        raise RuntimeError(f"model failed to load: {_model_error}")
    return _model


def decode_audio(data: bytes) -> np.ndarray:
    """webm/opus/wav/mp3 → 16 kHz mono float32 numpy (what faster-whisper wants)."""
    import av

    container = av.open(io.BytesIO(data))
    try:
        stream = next(s for s in container.streams if s.type == "audio")
        resampler = av.AudioResampler(format="fltp", layout="mono", rate=16000)
        chunks = []
        for frame in container.decode(stream):
            for r in resampler.resample(frame):
                chunks.append(r.to_ndarray().reshape(-1))
        try:
            for r in resampler.resample(None):
                chunks.append(r.to_ndarray().reshape(-1))
        except Exception:
            pass
        if not chunks:
            return np.zeros(0, dtype=np.float32)
        return np.concatenate(chunks).astype(np.float32)
    finally:
        container.close()


@app.get("/health")
def health():
    return {
        "status": "ok" if _model is not None else ("loading" if not _model_ready.is_set() else "error"),
        "model": MODEL_ID,
        "error": _model_error,
    }


@app.get("/v1/models")
def models():
    return {
        "object": "list",
        "data": [{"id": MODEL_ID, "object": "model", "created": 0, "owned_by": "local"}],
    }


def _lang(v):
    if not v or v == "auto":
        return None
    v = str(v).strip().lower().replace("_", "-")
    return v.split("-")[0] or None


@app.post("/v1/audio/transcriptions")
async def transcriptions(
    file: UploadFile = File(...),
    model: str = Form("whisper-1"),
    language: str = Form(""),
    response_format: str = Form("json"),
    prompt: str = Form(""),
    timestamp_granularities: str = Form(""),
    timestamp_granularities_: str = Form("", alias="timestamp_granularities[]"),
):
    m = _wait_model()
    audio = decode_audio(await file.read())
    segments_iter, info = m.transcribe(
        audio,
        language=_lang(language),
        beam_size=5,
        vad_filter=True,
        word_timestamps=True,
        condition_on_previous_text=False,
        initial_prompt=prompt or None,
    )
    segs = []
    words = []
    texts = []
    for i, s in enumerate(segments_iter):
        text = s.text.strip()
        texts.append(text)
        seg_words = []
        for w in s.words or []:
            seg_words.append({"word": w.word, "start": round(w.start, 3), "end": round(w.end, 3)})
            words.append({"word": w.word, "start": round(w.start, 3), "end": round(w.end, 3)})
        segs.append({
            "id": i, "start": round(s.start, 3), "end": round(s.end, 3),
            "text": text, "words": seg_words,
        })
    full = " ".join(texts).strip()
    fmt = (response_format or "json").lower()
    if fmt == "text":
        return PlainTextResponse(full)
    if fmt == "verbose_json":
        return JSONResponse({
            "task": "transcribe",
            "language": info.language,
            "language_probability": round(info.language_probability, 4),
            "duration": round(info.duration, 3),
            "text": full,
            "segments": segs,
            "words": words,
        })
    # json + srt/vtt fall back to plain json shape (our client uses verbose_json)
    return JSONResponse({"text": full})


def main():
    global MODEL_ID
    p = argparse.ArgumentParser()
    p.add_argument("--model", default=os.environ.get("WIT_LOCAL_ASR_MODEL", "Systran/faster-whisper-small"))
    p.add_argument("--port", type=int, default=int(os.environ.get("WIT_LOCAL_ASR_PORT", "8791")))
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--check", action="store_true", help="load model, print status, exit (used by setup)")
    args = p.parse_args()
    MODEL_ID = args.model

    threading.Thread(target=_load, daemon=True).start()
    if args.check:
        _model_ready.wait()
        if _model is None:
            print(f"model load failed: {_model_error}", flush=True)
            raise SystemExit(1)
        print(f"model ready: {MODEL_ID}", flush=True)
        return
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
