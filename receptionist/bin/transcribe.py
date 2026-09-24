#!/usr/bin/env python3
"""Transcribe a 16 kHz mono wav with Vosk. Prints the text to stdout."""

import json
import sys
import wave


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: transcribe.py input.wav", file=sys.stderr)
        return 2
    try:
        from vosk import KaldiRecognizer, Model
    except ImportError:
        print("vosk is not installed. pip install vosk and set VOSK_MODEL.", file=sys.stderr)
        return 2
    import os

    model_path = os.environ.get("VOSK_MODEL", "")
    if not model_path:
        print("VOSK_MODEL is not set to a Vosk model directory.", file=sys.stderr)
        return 2
    model = Model(model_path)
    with wave.open(sys.argv[1], "rb") as audio:
        recognizer = KaldiRecognizer(model, audio.getframerate())
        while True:
            data = audio.readframes(4000)
            if not data:
                break
            recognizer.AcceptWaveform(data)
        result = json.loads(recognizer.FinalResult())
    print(result.get("text", ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
