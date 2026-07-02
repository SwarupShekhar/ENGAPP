#!/usr/bin/env python3
"""
Phase 0: Cerebras smoke test for Maya tutor prompts.

Usage (from repo root):
  git checkout feat/cerebras-maya-llm
  cd backend-ai

  # If `pip install` fails in .venv (broken pip shim), use:
  pip3 --python ../.venv/bin/python3 install cerebras-cloud-sdk python-dotenv

  ../.venv/bin/python3 scripts/smoke_cerebras_maya.py --stream-only
  ../.venv/bin/python3 scripts/smoke_cerebras_maya.py --list-models

Requires CEREBRAS_API_KEY in backend-ai/.env (or environment).
Does not touch production code paths — standalone benchmark only.
"""
from __future__ import annotations

import argparse
import os
import re
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

# backend-ai root on sys.path
_ROOT = Path(__file__).resolve().parents[1]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

try:
    from dotenv import load_dotenv
except ImportError:
    load_dotenv = None  # type: ignore

from app.features.tutor.prompt_builder import build_conversation_prompt
from app.features.tutor.pronunciation_capture import strip_pron_tags_for_mobile


SENTENCE_END = re.compile(r"[.!?]\s*")

MAYA_SCENARIOS: list[dict[str, Any]] = [
    {
        "name": "casual_greeting",
        "utterance": "Hello Maya, I want to practice speaking about my job.",
        "cefr": "B1",
        "history": [],
        "phonetic_context": None,
    },
    {
        "name": "pronunciation_vater",
        "utterance": "I need a glass of vater please.",
        "cefr": "A2",
        "history": [
            {"role": "user", "content": "Hi Maya."},
            {"role": "assistant", "content": "Hi! What would you like to talk about today?"},
        ],
        "phonetic_context": {
            "reference_text": "I need a glass of water please.",
            "accuracy_score": 62,
            "phonetic_insights": {
                "critical_errors": [{"word": "water", "score": 45}],
                "minor_errors": [],
                "indian_english_patterns": [],
            },
        },
    },
    {
        "name": "gibberish_recovery",
        "utterance": "English speaking is people making people.",
        "cefr": "A2",
        "history": [],
        "phonetic_context": None,
    },
]


@dataclass
class RunResult:
    model: str
    scenario: str
    stream: bool
    ok: bool
    error: str | None = None
    ttft_ms: float | None = None
    total_ms: float | None = None
    raw_text: str = ""
    spoken_text: str = ""
    sentence_count: int = 0
    has_pron_tag: bool = False
    checks: list[str] = field(default_factory=list)


def _load_env() -> None:
    env_path = _ROOT / ".env"
    if load_dotenv and env_path.is_file():
        load_dotenv(env_path)
    elif env_path.is_file():
        for line in env_path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, val = line.partition("=")
            os.environ.setdefault(key.strip(), val.strip().strip('"').strip("'"))


def build_maya_prompt(
    utterance: str,
    history: list,
    phonetic_context: dict | None,
    cefr_level: str | None,
) -> str:
    return build_conversation_prompt(
        utterance,
        history,
        phonetic_context=phonetic_context,
        cefr_level=cefr_level,
    )


def _split_sentences(text: str) -> list[str]:
    parts: list[str] = []
    buf = text
    while buf:
        m = SENTENCE_END.search(buf)
        if not m:
            if buf.strip():
                parts.append(buf.strip())
            break
        parts.append(buf[: m.end()].strip())
        buf = buf[m.end() :]
    return [p for p in parts if p]


def _validate_maya_output(scenario: str, raw: str, spoken: str) -> list[str]:
    checks: list[str] = []
    if not spoken.strip():
        checks.append("FAIL: empty spoken reply")
        return checks

    sentences = _split_sentences(spoken)
    if len(sentences) < 1:
        checks.append("FAIL: no complete sentence detected")
    elif len(sentences) > 3:
        checks.append(f"WARN: {len(sentences)} sentences (Maya targets 2)")

    if re.search(r"[*_`#]", spoken):
        checks.append("WARN: markdown artifacts in reply")

    if re.search(
        r"\b(namaste|arre|shabash|bhai|acha|koi baat nahi)\b",
        spoken,
        re.I,
    ):
        checks.append("FAIL: Hindi/Hinglish word in reply")

    if scenario == "gibberish_recovery":
        if "didn't quite catch" in spoken.lower() or "say it again" in spoken.lower():
            checks.append("OK: gibberish recovery phrasing")
        else:
            checks.append("WARN: expected clarify-and-repeat for gibberish")

    if scenario == "pronunciation_vater":
        if "water" in spoken.lower():
            checks.append("OK: water correction modeled")
        else:
            checks.append("WARN: no water correction in reply")

    if not checks or all(c.startswith("OK") or c.startswith("WARN") for c in checks if not c.startswith("FAIL")):
        if not any(c.startswith("FAIL") for c in checks):
            checks.append("OK: basic structure")

    return checks


def _list_cerebras_models(client: Any) -> list[str]:
    try:
        resp = client.models.list()
        return [getattr(m, "id", str(m)) for m in resp.data]
    except Exception as e:
        print(f"WARN: could not list models: {e}", file=sys.stderr)
        return []


def _default_max_tokens(model: str, cli_default: int) -> int:
    """Reasoning models (gpt-oss, zai-glm) need a larger budget before content appears."""
    mid = model.lower()
    if "gpt-oss" in mid or "zai-glm" in mid or "glm" in mid:
        return max(cli_default, 800)
    return cli_default


def run_cerebras(
    client: Any,
    model: str,
    prompt: str,
    *,
    stream: bool,
    max_tokens: int,
    temperature: float,
) -> RunResult:
    scenario = ""
    result = RunResult(model=model, scenario=scenario, stream=stream, ok=False)

    t0 = time.perf_counter()
    ttft: float | None = None
    chunks: list[str] = []

    try:
        if stream:
            stream_resp = client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model=model,
                max_completion_tokens=max_tokens,
                temperature=temperature,
                top_p=0.9,
                stream=True,
            )
            for chunk in stream_resp:
                delta = ""
                try:
                    delta = chunk.choices[0].delta.content or ""
                except (AttributeError, IndexError, TypeError):
                    pass
                if delta and ttft is None:
                    ttft = (time.perf_counter() - t0) * 1000
                if delta:
                    chunks.append(delta)
        else:
            completion = client.chat.completions.create(
                messages=[{"role": "user", "content": prompt}],
                model=model,
                max_completion_tokens=max_tokens,
                temperature=temperature,
                top_p=0.9,
                stream=False,
            )
            text = completion.choices[0].message.content or ""
            chunks.append(text)
            ttft = (time.perf_counter() - t0) * 1000

        total_ms = (time.perf_counter() - t0) * 1000
        raw = "".join(chunks).strip()
        spoken = strip_pron_tags_for_mobile(raw)
        sentences = _split_sentences(spoken)

        result.ttft_ms = round(ttft or total_ms, 1)
        result.total_ms = round(total_ms, 1)
        result.raw_text = raw
        result.spoken_text = spoken
        result.sentence_count = len(sentences)
        result.has_pron_tag = "[PRON:" in raw
        result.ok = bool(spoken)
    except Exception as e:
        result.error = str(e)
        result.total_ms = round((time.perf_counter() - t0) * 1000, 1)

    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="Cerebras Maya tutor smoke test")
    parser.add_argument(
        "--models",
        default=os.environ.get(
            "CEREBRAS_SMOKE_MODELS",
            "gpt-oss-120b",
        ),
        help="Comma-separated Cerebras model ids",
    )
    parser.add_argument("--list-models", action="store_true", help="Print models available to your API key and exit")
    parser.add_argument("--stream-only", action="store_true", help="Skip non-streaming runs")
    parser.add_argument("--max-tokens", type=int, default=220, help="Base max_completion_tokens (reasoning models auto-bumped)")
    parser.add_argument("--temperature", type=float, default=0.55)
    args = parser.parse_args()

    _load_env()
    api_key = os.environ.get("CEREBRAS_API_KEY", "").strip()
    if not api_key:
        print("ERROR: CEREBRAS_API_KEY not set. Add it to backend-ai/.env", file=sys.stderr)
        return 1

    try:
        from cerebras.cloud.sdk import Cerebras
    except ImportError:
        print(
            "ERROR: cerebras-cloud-sdk not installed. Run: pip install cerebras-cloud-sdk",
            file=sys.stderr,
        )
        return 1

    client = Cerebras(api_key=api_key)

    if args.list_models:
        for mid in _list_cerebras_models(client):
            print(mid)
        return 0

    available = _list_cerebras_models(client)
    requested = [m.strip() for m in args.models.split(",") if m.strip()]
    if available:
        models = [m for m in requested if m in available]
        missing = [m for m in requested if m not in available]
        for m in missing:
            print(f"SKIP: model not on account: {m}", file=sys.stderr)
        if not models:
            models = available
            print(f"Using all account models: {', '.join(models)}", file=sys.stderr)
    else:
        models = requested

    print("=" * 72)
    print("Cerebras Maya smoke test (Phase 0)")
    print(f"Models: {', '.join(models)}")
    print(f"Scenarios: {len(MAYA_SCENARIOS)} | max_tokens={args.max_tokens} temp={args.temperature}")
    print("=" * 72)

    all_results: list[RunResult] = []
    failures = 0

    for model in models:
        print(f"\n--- Model: {model} ---")
        for scenario in MAYA_SCENARIOS:
            prompt = build_maya_prompt(
                scenario["utterance"],
                scenario["history"],
                scenario.get("phonetic_context"),
                scenario.get("cefr"),
            )
            max_tokens = _default_max_tokens(model, args.max_tokens)
            for stream in ([True] if args.stream_only else [True, False]):
                label = "stream" if stream else "sync"
                print(f"\n  [{scenario['name']}] ({label}) ...", end="", flush=True)
                res = run_cerebras(
                    client,
                    model,
                    prompt,
                    stream=stream,
                    max_tokens=max_tokens,
                    temperature=args.temperature,
                )
                res.scenario = scenario["name"]
                res.checks = _validate_maya_output(
                    scenario["name"], res.raw_text, res.spoken_text
                )
                all_results.append(res)

                if res.error:
                    failures += 1
                    print(f" ERROR")
                    print(f"    {res.error}")
                    continue

                fail_checks = [c for c in res.checks if c.startswith("FAIL")]
                if fail_checks:
                    failures += 1

                print(f" ttft={res.ttft_ms}ms total={res.total_ms}ms sentences={res.sentence_count}")
                print(f"    spoken: {res.spoken_text[:200]}{'...' if len(res.spoken_text) > 200 else ''}")
                if res.has_pron_tag:
                    print("    PRON tags: yes")
                for c in res.checks:
                    print(f"    {c}")

    # Summary table
    print("\n" + "=" * 72)
    print("SUMMARY (streaming runs only)")
    print(f"{'Model':<22} {'Scenario':<22} {'TTFT ms':>8} {'Total ms':>9} {'OK':>4}")
    print("-" * 72)
    stream_results = [r for r in all_results if r.stream and not r.error]
    for r in stream_results:
        ok = not any(c.startswith("FAIL") for c in r.checks)
        print(
            f"{r.model:<22} {r.scenario:<22} {r.ttft_ms or 0:>8.1f} {r.total_ms or 0:>9.1f} {'yes' if ok else 'no':>4}"
        )

    if stream_results:
        avg_ttft = sum(r.ttft_ms or 0 for r in stream_results) / len(stream_results)
        avg_total = sum(r.total_ms or 0 for r in stream_results) / len(stream_results)
        print("-" * 72)
        print(f"{'AVERAGE':<44} {avg_ttft:>8.1f} {avg_total:>9.1f}")

    errored = [r for r in all_results if r.error]
    if errored:
        print(f"\n{len(errored)} run(s) failed with API errors.")
        failures += 0  # already counted

    print("\nNext: pick the best model/quality tradeoff, then implement StreamingCerebrasService on this branch.")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
