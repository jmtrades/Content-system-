#!/usr/bin/env python3
# ============================================================================
# Content Empire - Faster-Whisper Caption Worker
# ============================================================================
# Generates SRT subtitle files from audio using Faster-Whisper.
#
# Usage:
#   python3 scripts/caption_worker.py <audio_path> <output_srt_path>
#   python3 scripts/caption_worker.py input.wav output.srt --model large-v2
#   python3 scripts/caption_worker.py input.mp3 output.srt --language en
#
# Requirements:
#   pip install faster-whisper
# ============================================================================

import sys
import argparse
import os
from typing import Optional


def format_timestamp(seconds: float) -> str:
    """Convert seconds to SRT timestamp format: HH:MM:SS,mmm"""
    if seconds < 0:
        seconds = 0.0

    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    milliseconds = int(round((seconds - int(seconds)) * 1000))

    # Clamp milliseconds to 999 to handle floating-point edge cases
    if milliseconds > 999:
        milliseconds = 999

    return f"{hours:02d}:{minutes:02d}:{secs:02d},{milliseconds:03d}"


def transcribe_to_srt(
    audio_path: str,
    output_srt_path: str,
    model_size: str = "medium",
    language: Optional[str] = None,
) -> None:
    """
    Transcribe an audio file and write the result as an SRT subtitle file.

    Args:
        audio_path: Path to the input audio file (wav, mp3, m4a, etc.)
        output_srt_path: Path where the SRT file will be written
        model_size: Whisper model size (tiny, base, small, medium, large-v2, etc.)
        language: Optional ISO language code (e.g., 'en'). Auto-detected if None.
    """
    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(
            "ERROR: faster-whisper is not installed.\n"
            "Install it with: pip install faster-whisper",
            file=sys.stderr,
        )
        sys.exit(2)

    # Validate input file
    if not os.path.isfile(audio_path):
        print(f"ERROR: Audio file not found: {audio_path}", file=sys.stderr)
        sys.exit(3)

    file_size = os.path.getsize(audio_path)
    if file_size == 0:
        print(f"ERROR: Audio file is empty: {audio_path}", file=sys.stderr)
        sys.exit(3)

    print(f"[caption_worker] Loading model: {model_size} (device=cpu, compute=int8)")
    model = WhisperModel(model_size, device="cpu", compute_type="int8")

    print(f"[caption_worker] Transcribing: {audio_path} ({file_size / (1024*1024):.1f} MB)")

    transcribe_kwargs = {
        "beam_size": 5,
        "word_timestamps": True,
    }
    if language is not None:
        transcribe_kwargs["language"] = language

    segments, info = model.transcribe(audio_path, **transcribe_kwargs)

    detected_lang = info.language
    lang_prob = info.language_probability
    print(
        f"[caption_worker] Detected language: {detected_lang} "
        f"(probability: {lang_prob:.2f})"
    )

    # Ensure output directory exists
    output_dir = os.path.dirname(output_srt_path)
    if output_dir and not os.path.isdir(output_dir):
        os.makedirs(output_dir, exist_ok=True)

    srt_index = 0
    total_duration = 0.0

    with open(output_srt_path, "w", encoding="utf-8") as srt_file:
        for segment in segments:
            srt_index += 1
            start_ts = format_timestamp(segment.start)
            end_ts = format_timestamp(segment.end)
            text = segment.text.strip()

            if not text:
                srt_index -= 1
                continue

            srt_file.write(f"{srt_index}\n")
            srt_file.write(f"{start_ts} --> {end_ts}\n")
            srt_file.write(f"{text}\n")
            srt_file.write("\n")

            total_duration = max(total_duration, segment.end)

    print(
        f"[caption_worker] Complete: {srt_index} segments, "
        f"{total_duration:.1f}s total duration"
    )
    print(f"[caption_worker] Output written to: {output_srt_path}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate SRT captions from audio using Faster-Whisper",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=(
            "Examples:\n"
            "  python3 caption_worker.py recording.wav captions.srt\n"
            "  python3 caption_worker.py audio.mp3 out.srt --model large-v2\n"
            "  python3 caption_worker.py audio.wav out.srt --language en\n"
        ),
    )
    parser.add_argument(
        "audio_path",
        help="Path to the input audio file (wav, mp3, m4a, flac, ogg, etc.)",
    )
    parser.add_argument(
        "output_srt_path",
        help="Path where the SRT subtitle file will be written",
    )
    parser.add_argument(
        "--model",
        default="medium",
        choices=["tiny", "base", "small", "medium", "large-v1", "large-v2", "large-v3"],
        help="Whisper model size (default: medium)",
    )
    parser.add_argument(
        "--language",
        default=None,
        help="ISO language code (e.g., 'en', 'es', 'fr'). Auto-detected if not specified.",
    )

    args = parser.parse_args()

    try:
        transcribe_to_srt(
            audio_path=args.audio_path,
            output_srt_path=args.output_srt_path,
            model_size=args.model,
            language=args.language,
        )
    except KeyboardInterrupt:
        print("\n[caption_worker] Interrupted by user", file=sys.stderr)
        sys.exit(130)
    except MemoryError:
        print(
            "[caption_worker] ERROR: Out of memory. Try a smaller model (--model small or --model base).",
            file=sys.stderr,
        )
        sys.exit(4)
    except Exception as exc:
        print(f"[caption_worker] ERROR: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
