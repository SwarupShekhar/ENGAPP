from app.features.tutor.trace_timings import TraceTimings


def test_trace_timings_deltas_and_meta():
    t = TraceTimings("trace-1")
    t.mark("request_start")
    t._marks["request_start"] = 0.0
    t._marks["stt_done"] = 320.0
    t._marks["llm_stream_start"] = 325.0
    t.set_meta(stt_provider="deepgram", llm_provider="cerebras")

    assert t.delta_ms("stt_done", "request_start") == 320.0
    assert t.delta_ms("llm_stream_start", "stt_done") == 5.0

    payload = t.to_dict()
    assert payload["stt_ms"] == 320.0
    assert payload["llm_gap_ms"] == 5.0
    assert payload["meta"]["stt_provider"] == "deepgram"
    assert payload["meta"]["llm_provider"] == "cerebras"
