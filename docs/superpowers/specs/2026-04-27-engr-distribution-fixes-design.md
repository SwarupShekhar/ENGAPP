# EngR Distribution Build Fixes — Design Spec

**Date:** 2026-04-27  
**Status:** Approved

---

## 1. Problem Summary

Three issues in the internal distribution build:

| # | Problem | Root Cause |
|---|---------|------------|
| 1 | EngR/Pulse data missing, matchmaking/socket broken | `LOCAL_IP` hardcoded to `192.168.1.34` in `client.ts` and `englivoClient.ts`; stale for current network |
| 2 | Englivo AI tutor 404s (`/api/ai-tutor/report`, `/api/me`, etc.) | Production URL in `englivoClient.ts` points to `englivo-ai.onrender.com` (FastAPI) which lacks Next.js routes |
| 3 | Pulse call feedback errors only shown as text | No per-error TTS; user should tap speaker icon to hear mistake spoken aloud |

---

## 2. Fix 1 — Local Backend URL Configuration

### Goal
Internal distribution builds hit the locally-running NestJS backend without modifying source code per-session.

### Files Changed
- `scripts/set-local-ip.sh` *(new)*
- `mobile/app.config.js` — add `englivoApiUrlOverride` from `process.env.ENGLIVO_API_URL_OVERRIDE`
- `mobile/.env.local` *(gitignored, written by script)*

### Design

**`scripts/set-local-ip.sh`:**
```bash
#!/bin/bash
# Auto-detect LAN IP (macOS Wi-Fi en0; falls back to en1)
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
if [ -z "$IP" ]; then
  echo "Could not detect LAN IP. Set APP_API_URL_OVERRIDE manually in mobile/.env.local"
  exit 1
fi
cat > mobile/.env.local <<EOF
APP_API_URL_OVERRIDE=http://${IP}:3000
ENGLIVO_API_URL_OVERRIDE=http://${IP}:8001
EOF
echo "Written to mobile/.env.local: NestJS → http://${IP}:3000, backend-ai → http://${IP}:8001"
```

**`app.config.js`:** Already reads `process.env.APP_API_URL_OVERRIDE` → `extra.apiUrlOverride`. Add:
```js
englivoApiUrlOverride: process.env.ENGLIVO_API_URL_OVERRIDE || '',
```

Both `client.ts` and `englivoClient.ts` already respect `EXTRA_API_URL_OVERRIDE` (read from `Constants.expoConfig.extra`) — no logic change needed.

### Dev Workflow
```bash
sh scripts/set-local-ip.sh   # run once when network/IP changes
npx expo start               # or eas build --profile preview
```

### What Doesn't Change
- `LOCAL_IP` constant stays as manual fallback
- `IS_PROD` production logic untouched
- Socket connects to `${API_URL}/chat` — auto-correct once API_URL resolves correctly

---

## 3. Fix 2 — Englivo REST API → englivo.com

### Goal
All Englivo REST calls (`/api/me`, `/api/history`, `/api/ai-tutor/report`, `/api/sessions`, etc.) go to `https://englivo.com`. AI tutor WebSocket stays on `wss://englivo-ai.onrender.com`.

### Files Changed
- `mobile/src/api/englivoClient.ts` — change prod URL
- `mobile/src/api/englivoApi.ts` — add `generateReport()`

### Design

**`englivoClient.ts` line 26:**
```ts
// Before:
? "https://englivo-ai.onrender.com"
// After:
? "https://englivo.com"
```

**`englivoApi.ts` — add missing function:**
```ts
export interface ReportPayload {
  transcript: string;
  duration: number;
  words: number;
  sessionId?: string;
}
export interface ReportResult {
  report?: any;
  [key: string]: any;
}
export const generateReport = (payload: ReportPayload): Promise<ReportResult> =>
  client.post<ReportResult>('/api/ai-tutor/report', payload).then((r) => r.data);
```

**`streamingTutorService.ts`:** No change — already hardcodes `wss://englivo-ai.onrender.com` for production WebSocket.

### Auth
`englivoClient.ts` sends `Authorization: Bearer <clerk_token>` + `x-client: app` header — matches what `englivo.com` Next.js backend expects.

### Local Dev
Dev path in `englivoClient.ts` still resolves to `LOCAL_IP:8001` (or override). 404 fallbacks for endpoints not on local FastAPI are already handled in code.

---

## 4. Fix 3 — Pulse Per-Error TTS (Speaker Button)

### Goal
Each pronunciation error row in `CallFeedbackScreen` has a speaker icon button. Tap → hears: *"Swarup, you said 'englis' — say 'english' instead. Place tongue between teeth and breathe out."*

### Architecture
```
IssueCard tap speaker
  → usePulseTTS hook
    → builds sentence from error (frontend)
    → POST /api/tts/speak { text } via client (NestJS)
      → NestJS proxies → backend-ai POST /api/tts/speak
        → Google Cloud TTS → returns audio_base64
    → write tmp file → expo-av plays audio
    → fallback: expo-speech if network fails
```

### Files Changed

#### backend-ai: `app/features/tts/routes.py`
Add new route (uses same `inworld_tts_service.synthesize_async` as existing routes):
```python
class SpeakRequest(BaseModel):
    text: str

@router.post("/speak", response_model=FeedbackNarrationResponse)
async def speak(request: Request, body: SpeakRequest):
    audio_bytes = await inworld_tts_service.synthesize_async(body.text)
    import base64
    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
    return FeedbackNarrationResponse(audio_base64=audio_b64, text=body.text)
```

#### NestJS: `backend-nest/src/modules/tts/tts.controller.ts`
Add proxy:
```ts
@Post('speak')
async speak(@Body() body: { text: string }) {
  const response = await lastValueFrom(
    this.httpService.post(`${this.aiEngineUrl}/api/tts/speak`, body, { timeout: 10000 })
  );
  return response.data;
}
```

#### Mobile: `mobile/src/api/tts.ts`
Add:
```ts
export async function fetchErrorSpeak(text: string): Promise<FeedbackNarrationResponse> {
  const res = await client.post<FeedbackNarrationResponse>('/api/tts/speak', { text }, { timeout: 10000 });
  return res.data;
}
```

**Note:** `getPronFix` and `PronIssueNormalized` are currently local to `CallFeedbackScreen.tsx`. They must be moved to `mobile/src/features/call/utils/pronUtils.ts` so the hook can import them.

#### Mobile: `mobile/src/features/call/utils/pronUtils.ts` *(new — extracted from CallFeedbackScreen)*
Move `getPronFix()`, `getPronUI()`, `getPronLabel()`, and `PronIssueNormalized` type here. Update `CallFeedbackScreen.tsx` to import from this file.

#### Mobile: `mobile/src/features/call/hooks/usePulseTTS.ts` *(new)*
```ts
// Builds sentence, calls TTS, plays audio, expo-speech fallback
export function usePulseTTS() {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

  const play = useCallback(async (issue: PronIssueNormalized, firstName?: string) => {
    // Build sentence from shared utils
    const tip = getPronFix(issue.rule_category); // imported from pronUtils.ts
    const name = firstName ? `${firstName}, ` : '';
    const text = `${name}you said "${issue.spoken}" — say "${issue.correct}" instead. ${tip}`;

    setPlayingId(issue.id);
    try {
      const result = await fetchErrorSpeak(text);
      if (result.audio_base64) {
        // write tmp file and play via expo-av
        const tmpUri = `${FileSystem.cacheDirectory}pron_${issue.id}.mp3`;
        await FileSystem.writeAsStringAsync(tmpUri, result.audio_base64, { encoding: 'base64' });
        const { sound } = await Audio.Sound.createAsync({ uri: tmpUri }, { shouldPlay: true });
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((s) => {
          if (s.isLoaded && s.didJustFinish) setPlayingId(null);
        });
      }
    } catch {
      // Fallback: expo-speech
      Speech.speak(text, { onDone: () => setPlayingId(null) });
    }
  }, []);

  const stop = useCallback(() => {
    soundRef.current?.stopAsync();
    Speech.stop();
    setPlayingId(null);
  }, []);

  return { playingId, play, stop };
}
```

#### Mobile: `CallFeedbackScreen.tsx` — `IssueCard` component
Add speaker button inside `IssueCard`. Tapping while another is playing stops it first:
```tsx
const { playingId, play, stop } = usePulseTTS();
// ...
// In IssueCard header row:
<TouchableOpacity onPress={() => {
  if (playingId === item.id) { stop(); return; }
  if (playingId) stop();
  play(item, firstName);
}}>
  <Ionicons
    name={playingId === item.id ? 'stop-circle' : 'volume-high-outline'}
    size={20}
    color={ui.text}
  />
</TouchableOpacity>
```

### Sentence Format
`"{firstName}, you said '{spoken}' — say '{correct}' instead. {tip}"`

- First name from `useUser().user.firstName` passed into the component
- `tip` from existing `getPronFix(rule_category)` (already in the screen)
- Fallback: `expo-speech` if TTS endpoint unreachable

---

## 5. Out of Scope
- Switching to production cloud (Vultr) — separate infrastructure task
- Auto-play (option A) or Play All (option C) — future iteration
- Englivo socket errors — will resolve once `englivoClient.ts` URL is corrected

---

## 6. File Change Summary

| File | Change |
|------|--------|
| `scripts/set-local-ip.sh` | New — auto-detect LAN IP, write `.env.local` |
| `mobile/app.config.js` | Add `englivoApiUrlOverride` from env |
| `mobile/src/api/englivoClient.ts` | Prod URL: `englivo-ai.onrender.com` → `englivo.com` |
| `mobile/src/api/englivoApi.ts` | Add `generateReport()` |
| `mobile/src/api/tts.ts` | Add `fetchErrorSpeak()` |
| `mobile/src/features/call/hooks/usePulseTTS.ts` | New hook |
| `mobile/src/features/call/utils/pronUtils.ts` | New — extract `getPronFix`, `getPronUI`, `getPronLabel`, `PronIssueNormalized` |
| `mobile/src/features/call/screens/CallFeedbackScreen.tsx` | Import from pronUtils; add speaker button to `IssueCard` |
| `backend-ai/app/features/tts/routes.py` | Add `POST /speak` route |
| `backend-nest/src/modules/tts/tts.controller.ts` | Add `POST speak` proxy |
