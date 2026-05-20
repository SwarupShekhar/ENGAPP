import asyncio

import pytest

from app.features.tutor import pa_streaming


def test_has_usable_phonetic_context():
    assert not pa_streaming.has_usable_phonetic_context(None)
    assert not pa_streaming.has_usable_phonetic_context({})
    assert pa_streaming.has_usable_phonetic_context({"accuracy_score": 72})
    assert pa_streaming.has_usable_phonetic_context(
        {"phonetic_insights": {"critical_errors": [{"word": "water"}]}}
    )


@pytest.mark.asyncio
async def test_phonetic_context_for_stream_uses_client_without_waiting():
    async def slow_pa():
        await asyncio.sleep(5)
        return {"accuracy_score": 1}

    task = asyncio.create_task(slow_pa())
    ctx, included = await pa_streaming.phonetic_context_for_stream(
        task,
        client_phonetic={"accuracy_score": 88},
    )
    assert included is True
    assert ctx["accuracy_score"] == 88
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task


@pytest.mark.asyncio
async def test_phonetic_context_for_stream_timeout_returns_empty(monkeypatch):
    monkeypatch.setattr(pa_streaming.settings, "pa_stream_wait_ms", 50)

    async def slow_pa():
        await asyncio.sleep(2)
        return {"accuracy_score": 99}

    task = asyncio.create_task(slow_pa())
    ctx, included = await pa_streaming.phonetic_context_for_stream(task)
    assert included is False
    assert ctx == {}
    enriched = await task
    assert enriched["accuracy_score"] == 99


@pytest.mark.asyncio
async def test_phonetic_context_for_capture_awaits_pa():
    async def pa():
        await asyncio.sleep(0.01)
        return {"accuracy_score": 55}

    task = asyncio.create_task(pa())
    capture = await pa_streaming.phonetic_context_for_capture(task, {})
    assert capture["accuracy_score"] == 55
