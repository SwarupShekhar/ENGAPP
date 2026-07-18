"""Offline tests for the LLM grammar grader (no network)."""

import asyncio

from app.core.config import settings
from app.features.scoring import grammar_llm


def test_extract_json_plain():
    out = grammar_llm._extract_json('{"score": 42, "error_count": 3}')
    assert out == {"score": 42, "error_count": 3}


def test_extract_json_code_fenced():
    raw = '```json\n{"score": 88, "examples": ["a"]}\n```'
    out = grammar_llm._extract_json(raw)
    assert out["score"] == 88


def test_extract_json_with_surrounding_prose():
    raw = 'Here is the result:\n{"score": 55, "rationale": "ok"}\nThanks!'
    out = grammar_llm._extract_json(raw)
    assert out["score"] == 55


def test_extract_json_truncated_returns_none():
    # Missing closing brace (the reasoning-model truncation bug) → unparseable.
    assert grammar_llm._extract_json('{"score": 28, "rationale":') is None


def test_coerce_clamps_and_shapes():
    out = grammar_llm._coerce(
        {"score": 250, "error_count": "5", "examples": "just one", "rationale": "x" * 500},
        "cerebras",
    )
    assert out["score"] == 100.0
    assert out["error_count"] == 5
    assert out["examples"] == ["just one"]
    assert len(out["rationale"]) <= 300
    assert out["provider"] == "cerebras"


def test_coerce_rejects_missing_score():
    assert grammar_llm._coerce({"error_count": 3}, "gemini") is None


def test_disabled_returns_none(monkeypatch):
    monkeypatch.setattr(settings, "grammar_llm_enabled", False)
    assert asyncio.run(grammar_llm.grade_grammar_llm(["hello there"])) is None


def test_empty_transcript_returns_none(monkeypatch):
    monkeypatch.setattr(settings, "grammar_llm_enabled", True)
    assert asyncio.run(grammar_llm.grade_grammar_llm(["", "   "])) is None


def test_fallback_reports_not_measured_no_fake_number(monkeypatch):
    from app.features.scoring.service import call_quality_service as svc

    monkeypatch.setattr(settings, "grammar_llm_enabled", False)
    turns = ["I really enjoy learning languages because it broadens my perspective."]
    meta = asyncio.run(svc.compute_grammar_score_llm(turns))
    # Evidence-minimum rule: fallback must NOT emit a grammar number.
    assert meta["measured"] is False
    assert meta["score"] is None
    assert meta["source"] == "structural_fallback"
    # Structural score kept only as a debug breadcrumb, never as the score.
    assert meta["debug_structural_score"] == svc.compute_grammar_score(turns)


def test_service_uses_llm_when_available(monkeypatch):
    from app.features.scoring.service import call_quality_service as svc

    async def fake_grade(_turns):
        return {
            "score": 31.0,
            "provider": "cerebras",
            "error_count": 7,
            "examples": ["I English no speak"],
            "rationale": "broken",
        }

    monkeypatch.setattr(settings, "grammar_llm_enabled", True)
    monkeypatch.setattr(grammar_llm, "grade_grammar_llm", fake_grade)
    # service imports grade_grammar_llm lazily from the module, so patch the source.
    meta = asyncio.run(svc.compute_grammar_score_llm(["I English no speak"]))
    assert meta["source"] == "llm"
    assert meta["measured"] is True
    assert meta["score"] == 31.0
    assert meta["provider"] == "cerebras"


def test_metrics_records_fallback_and_alerts(monkeypatch):
    from app.features.scoring import grammar_metrics

    grammar_metrics.reset()
    # 1 llm + 25 fallbacks → fallback rate well over 5% on a >=20 sample.
    grammar_metrics.record("llm", provider="cerebras")
    for _ in range(25):
        grammar_metrics.record("structural_fallback", reason="provider_failed_or_unparseable")
    snap = grammar_metrics.snapshot()
    assert snap["total"] == 26
    assert snap["structural_fallback"] == 25
    assert snap["fallback_rate"] > 0.05
    assert snap["alerting"] is True
    grammar_metrics.reset()


def test_metrics_healthy_when_llm_dominates(monkeypatch):
    from app.features.scoring import grammar_metrics

    grammar_metrics.reset()
    for _ in range(40):
        grammar_metrics.record("llm", provider="cerebras")
    grammar_metrics.record("structural_fallback", reason="exception")
    snap = grammar_metrics.snapshot()
    assert snap["fallback_rate"] < 0.05
    assert snap["alerting"] is False
    grammar_metrics.reset()


def test_disabled_records_fallback_reason(monkeypatch):
    from app.features.scoring.service import call_quality_service as svc
    from app.features.scoring import grammar_metrics

    grammar_metrics.reset()
    monkeypatch.setattr(settings, "grammar_llm_enabled", False)
    meta = asyncio.run(svc.compute_grammar_score_llm(["hello world this is fine"]))
    assert meta["source"] == "structural_fallback"
    assert meta["measured"] is False
    assert meta["fallback_reason"] == "disabled"
    assert grammar_metrics.snapshot()["structural_fallback"] == 1
    grammar_metrics.reset()
