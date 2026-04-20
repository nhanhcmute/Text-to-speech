import os
import sys
import re
import uuid
import asyncio
import glob
import time
import threading
from flask import Flask, render_template, request, jsonify

# Fix Windows event loop policy (required for edge-tts on Windows)
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import edge_tts

app = Flask(__name__)

GENERATED_DIR = os.path.join(app.static_folder, "generated")
os.makedirs(GENERATED_DIR, exist_ok=True)

FILE_EXPIRY_SECONDS = 3600  # auto-delete files older than 1 hour
CHUNK_SIZE = 1500           # max characters per API call

# Thread-safe voice list cache
_voices_cache = None
_voices_lock = threading.Lock()


# ─────────────────────────────── text chunking ──────────────────────────────

def split_text(text: str, max_chunk: int = CHUNK_SIZE) -> list:
    """
    Split text into chunks ≤ max_chunk chars without breaking sentences.
    Strategy: paragraphs → sentences → hard-cut (last resort).
    """
    # Normalise line endings
    text = text.replace("\r\n", "\n").replace("\r", "\n")

    # Split into paragraphs
    paragraphs = re.split(r"\n{2,}", text)

    chunks = []
    current = ""

    for para in paragraphs:
        para = para.strip()
        if not para:
            continue

        if len(current) + len(para) + 2 <= max_chunk:
            # Paragraph fits alongside current buffer
            current = (current + "\n\n" + para).lstrip("\n")
        else:
            # Flush current buffer first
            if current:
                chunks.append(current.strip())
                current = ""

            if len(para) <= max_chunk:
                current = para
            else:
                # Split long paragraph by sentence boundaries
                sentences = re.split(r"(?<=[.!?。！？;；])\s+", para)
                for sent in sentences:
                    sent = sent.strip()
                    if not sent:
                        continue
                    if len(current) + len(sent) + 1 <= max_chunk:
                        current = (current + " " + sent).strip()
                    else:
                        if current:
                            chunks.append(current.strip())
                        if len(sent) > max_chunk:
                            # Hard-cut oversized single sentence
                            for i in range(0, len(sent), max_chunk):
                                chunks.append(sent[i : i + max_chunk])
                            current = ""
                        else:
                            current = sent

    if current.strip():
        chunks.append(current.strip())

    return chunks if chunks else [text]


# ─────────────────────────────── TTS synthesis ──────────────────────────────

async def synthesize_chunks(chunks: list, voice: str, rate: str, volume: str) -> bytes:
    """Call edge-tts for all chunks in parallel, then merge MP3 bytes in order."""

    async def synth_one(chunk_text: str) -> bytes:
        data = b""
        communicate = edge_tts.Communicate(chunk_text, voice, rate=rate, volume=volume)
        async for item in communicate.stream():
            if item["type"] == "audio":
                data += item["data"]
        return data

    results = await asyncio.gather(*[synth_one(c) for c in chunks])
    return b"".join(results)


# ─────────────────────────────── helpers ────────────────────────────────────

def cleanup_old_files():
    """Remove generated audio files older than FILE_EXPIRY_SECONDS."""
    now = time.time()
    for filepath in glob.glob(os.path.join(GENERATED_DIR, "*.mp3")):
        try:
            if now - os.path.getmtime(filepath) > FILE_EXPIRY_SECONDS:
                os.remove(filepath)
        except OSError:
            pass


def get_voices():
    """Fetch and cache the full edge-tts voice list (network call once)."""
    global _voices_cache
    with _voices_lock:
        if _voices_cache is None:
            raw = asyncio.run(edge_tts.list_voices())
            _voices_cache = sorted(
                [
                    {
                        "name": v["ShortName"],
                        "display": v["FriendlyName"],
                        "locale": v["Locale"],
                        "gender": v["Gender"],
                    }
                    for v in raw
                ],
                key=lambda v: (v["locale"], v["name"]),
            )
    return _voices_cache


def format_rate(value: int) -> str:
    """Convert integer (-50..+100) to edge-tts rate string like '+15%'."""
    return f"+{value}%" if value >= 0 else f"{value}%"


# ─────────────────────────────── routes ─────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/voices")
def api_voices():
    try:
        voices = get_voices()
        return jsonify({"voices": voices})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


@app.route("/api/generate", methods=["POST"])
def api_generate():
    cleanup_old_files()

    data   = request.get_json(silent=True) or {}
    text   = (data.get("text") or "").strip()
    voice  = data.get("voice", "vi-VN-HoaiMyNeural")
    rate   = format_rate(int(data.get("rate", 0)))
    volume = format_rate(int(data.get("volume", 0)))

    if not text:
        return jsonify({"error": "Vui lòng nhập văn bản."}), 400
    if not voice:
        return jsonify({"error": "Vui lòng chọn giọng đọc."}), 400

    # Split into chunks, synthesise, merge
    chunks = split_text(text, CHUNK_SIZE)

    filename = f"{uuid.uuid4().hex}.mp3"
    filepath = os.path.join(GENERATED_DIR, filename)

    try:
        audio_bytes = asyncio.run(synthesize_chunks(chunks, voice, rate, volume))
        with open(filepath, "wb") as f:
            f.write(audio_bytes)
    except Exception as exc:
        return jsonify({"error": f"Lỗi tạo giọng nói: {exc}"}), 500

    return jsonify(
        {
            "audio_url": f"/static/generated/{filename}",
            "filename": filename,
            "chunks": len(chunks),       # thông tin cho frontend
            "chars": len(text),
        }
    )


# ─────────────────────────────── entry point ────────────────────────────────

if __name__ == "__main__":
    print("TTS Studio đang chạy tại: http://127.0.0.1:5000")
    app.run(debug=True, port=5000)
