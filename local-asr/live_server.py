# /// script
# requires-python = ">=3.10"
# dependencies = [
#   "sherpa-onnx>=1.10",
#   "fastapi>=0.110",
#   "uvicorn>=0.29",
#   "websockets>=12",
#   "numpy>=1.26",
# ]
# ///
"""Witness local live-ASR server — streaming zipformer via sherpa-onnx.

Fully offline: PCM16LE 16 kHz mono frames arrive over WebSocket (/live),
partial/final transcripts go back as JSON. Started by `wit local-asr live`
via `uv run`; the streaming model dir is downloaded by `wit local-asr live setup`.
"""
import argparse
import json

import numpy as np
import sherpa_onnx
import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

app = FastAPI(title="witness-local-live-asr")
REC = None
SAMPLE_RATE = 16000


def load_recognizer(model_dir: str) -> "sherpa_onnx.OnlineRecognizer":
    return sherpa_onnx.OnlineRecognizer.from_transducer(
        encoder=f"{model_dir}/encoder.int8.onnx",
        decoder=f"{model_dir}/decoder.int8.onnx",
        joiner=f"{model_dir}/joiner.int8.onnx",
        tokens=f"{model_dir}/tokens.txt",
        num_threads=2,
        sample_rate=SAMPLE_RATE,
        feature_dim=80,
        enable_endpoint_detection=True,
        rule1_min_trailing_silence=2.4,
        rule2_min_trailing_silence=1.2,
        rule3_min_utterance_length=20,
        decoding_method="greedy_search",
    )


@app.websocket("/live")
async def live(ws: WebSocket):
    global REC
    await ws.accept()
    rec = REC
    stream = rec.create_stream()
    try:
        while True:
            msg = await ws.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            data = msg.get("bytes")
            if data is None:
                continue
            if isinstance(data, (bytes, bytearray)) and len(data) >= 2:
                samples = np.frombuffer(data, dtype=np.int16).astype(np.float32) / 32768.0
                stream.accept_waveform(SAMPLE_RATE, samples)
                while rec.is_ready(stream):
                    rec.decode_stream(stream)
                text = rec.get_result(stream)
                if text:
                    await ws.send_text(json.dumps({"type": "partial", "text": text}))
                if rec.is_endpoint(stream):
                    final = rec.get_result(stream)
                    await ws.send_text(json.dumps({"type": "final", "text": final}))
                    rec.reset(stream)
            else:
                # JSON control frame: {"type":"eof"} flushes and closes
                try:
                    ctrl = json.loads(data if isinstance(data, str) else data.decode())
                except Exception:
                    ctrl = {}
                if ctrl.get("type") == "eof":
                    while rec.is_ready(stream):
                        rec.decode_stream(stream)
                    final = rec.get_result(stream)
                    await ws.send_text(json.dumps({"type": "final", "text": final}))
                    break
    except WebSocketDisconnect:
        pass
    finally:
        try:
            await ws.close()
        except Exception:
            pass


@app.get("/health")
def health():
    return {"ok": True, "model": "sherpa-onnx-streaming"}


def main():
    global REC
    p = argparse.ArgumentParser()
    p.add_argument("--model-dir", required=True)
    p.add_argument("--port", type=int, default=int(__import__("os").environ.get("WIT_LIVE_ASR_PORT", "8792")))
    p.add_argument("--host", default="127.0.0.1")
    args = p.parse_args()
    REC = load_recognizer(args.model_dir)
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")


if __name__ == "__main__":
    main()
