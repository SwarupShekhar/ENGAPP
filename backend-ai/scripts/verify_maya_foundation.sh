#!/usr/bin/env bash
# Verify Maya fast-path foundation on a running backend-ai instance.
# Usage (on VPS, from repo root):
#   bash backend-ai/scripts/verify_maya_foundation.sh
#   bash backend-ai/scripts/verify_maya_foundation.sh http://127.0.0.1:8001
#   bash backend-ai/scripts/verify_maya_foundation.sh http://127.0.0.1:8001 backend-ai-1
set -euo pipefail

HEALTH_URL="${1:-http://127.0.0.1:8001/api/health}"
CONTAINER="${2:-}"

echo "=== 1) Runtime config (keys present / expected providers) ==="
if ! curl -fsS -m 5 "$HEALTH_URL" | python3 -c '
import json,sys
h=json.load(sys.stdin)
m=h.get("maya") or {}
print(json.dumps(m, indent=2))
ok=True
if m.get("deepgram_key")!="configured":
    print("FAIL: DEEPGRAM_API_KEY missing — STT will stay on Azure (~1-2s)", file=sys.stderr); ok=False
if m.get("cerebras_key")!="configured":
    print("FAIL: CEREBRAS_API_KEY missing — text LLM falls back to Gemini", file=sys.stderr); ok=False
if m.get("stt_primary")!="deepgram":
    print("FAIL: stt_primary is", m.get("stt_primary"), "— expected deepgram", file=sys.stderr); ok=False
if m.get("text_llm_expected")!="cerebras":
    print("FAIL: text_llm_expected is", m.get("text_llm_expected"), "— expected cerebras", file=sys.stderr); ok=False
if int(m.get("coaching_hint_budget_ms") or 0) != 0:
    print("WARN: coaching_hint_budget_ms=", m.get("coaching_hint_budget_ms"),
          "(next-turn path should not block; prefer 0)", file=sys.stderr)
sys.exit(0 if ok else 1)
'; then
  echo "Health check failed or foundation flags incorrect."
  exit 1
fi
echo "PASS: keys + expected providers look correct."

echo
echo "=== 2) Recent maya_sse timings (need 10–20 real turns after deploy) ==="
if [ -n "$CONTAINER" ]; then
  LOG_CMD=(docker logs --tail 5000 "$CONTAINER")
elif docker ps --format '{{.Names}}' 2>/dev/null | grep -q 'backend-ai'; then
  NAME=$(docker ps --format '{{.Names}}' | grep 'backend-ai' | head -1)
  LOG_CMD=(docker logs --tail 5000 "$NAME")
  echo "(using container: $NAME)"
else
  echo "No container name given and none found. Pass container as arg 2, or pipe logs:"
  echo "  docker logs --tail 5000 <backend-ai> | bash backend-ai/scripts/summarize_maya_sse.sh"
  exit 0
fi

"${LOG_CMD[@]}" 2>&1 | python3 - <<'PY'
import re, sys, ast, statistics

# [latency] journey=maya_sse trace_id=... stt_ms=312.1 llm_gap_ms=4.2 ... meta={'stt_provider': 'deepgram', 'llm_provider': 'cerebras', ...}
pat = re.compile(
    r"\[latency\] journey=maya_sse\s+trace_id=(\S+)\s+stt_ms=(\S+)\s+llm_gap_ms=(\S+).*?meta=(\{.*?\})\s+timings="
)
rows = []
for line in sys.stdin:
    m = pat.search(line)
    if not m:
        continue
    try:
        meta = ast.literal_eval(m.group(4))
    except Exception:
        meta = {}
    def num(x):
        try:
            return float(x) if x not in (None, "None") else None
        except Exception:
            return None
    rows.append({
        "trace": m.group(1),
        "stt_ms": num(m.group(2)),
        "llm_gap_ms": num(m.group(3)),
        "stt": meta.get("stt_provider"),
        "llm": meta.get("llm_provider"),
        "coaching": meta.get("coaching_hint_injected"),
    })

if not rows:
    print("No maya_sse latency lines found yet. Do 10–20 real turns, then re-run.")
    sys.exit(0)

print(f"turns={len(rows)}")
stt_vals = [r["stt_ms"] for r in rows if r["stt_ms"] is not None]
llm_vals = [r["llm_gap_ms"] for r in rows if r["llm_gap_ms"] is not None]
if stt_vals:
    print(f"stt_ms: p50={statistics.median(stt_vals):.0f} mean={statistics.mean(stt_vals):.0f} max={max(stt_vals):.0f}")
if llm_vals:
    print(f"llm_gap_ms (llm_stream_start - stt_done): p50={statistics.median(llm_vals):.0f} mean={statistics.mean(llm_vals):.0f} max={max(llm_vals):.0f}")

from collections import Counter
print("stt_provider:", dict(Counter(r["stt"] for r in rows)))
print("llm_provider:", dict(Counter(r["llm"] for r in rows)))
print("coaching_hint_injected:", dict(Counter(r["coaching"] for r in rows)))

# Gates
stt_ok = all(r["stt"] == "deepgram" for r in rows)
llm_ok = all(r["llm"] == "cerebras" for r in rows)
slow_stt = [r for r in rows if r["stt_ms"] is not None and r["stt_ms"] > 800]
if not stt_ok:
    print("FAIL: some turns not on Deepgram STT", file=sys.stderr)
if not llm_ok:
    print("FAIL: some turns not on Cerebras (silent Gemini fallback?)", file=sys.stderr)
if slow_stt:
    print(f"WARN: {len(slow_stt)} turns with stt_ms>800 (Deepgram may be failing over to Azure)", file=sys.stderr)
if stt_ok and llm_ok:
    print("PASS: providers look correct on logged turns.")
PY

echo
echo "=== 3) Coaching next-turn store/inject ==="
"${LOG_CMD[@]}" 2>&1 | grep -E '\[coaching\] pendingCoachingHint (stored|injected)|no pendingCoachingHint|no hint to store' | tail -40 || true
echo "(Expect: 'stored for next turn' on turn N, 'injected' on turn N+1 when a hint exists.)"
