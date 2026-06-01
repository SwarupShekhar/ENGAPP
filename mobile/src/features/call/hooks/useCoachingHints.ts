import { useCallback, useEffect, useRef, useState } from 'react';
import { useAnalytics } from '../../../analytics/useAnalytics';
import { AnalyticsEvents } from '../../../analytics/events';

export interface CoachingHint {
  id: string;
  text: string;
  trigger: string;
}

interface UseCoachingHintsOptions {
  /**
   * Subscribe to raw LiveKit data packets. The caller passes a function that
   * registers a handler and returns an unsubscribe callback. This matches the
   * pattern used in InCallScreen where `room.on(RoomEvent.DataReceived, ...)` is
   * called inside DataListener. Callers can wrap that pattern here, or use the
   * imperative `pushHint` returned from this hook if they prefer to fan-out
   * from an existing DataReceived listener.
   */
  onDataReceived?: (handler: (data: Uint8Array, participantId?: string) => void) => () => void;
}

const HINT_DISPLAY_MS = 5000;

export function useCoachingHints(options?: UseCoachingHintsOptions) {
  const [queue, setQueue] = useState<CoachingHint[]>([]);
  const [current, setCurrent] = useState<CoachingHint | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analytics = useAnalytics();

  // dismiss is defined before pushHint so it can be referenced inside
  const dismiss = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // Pull next hint out of the queue atomically
    setQueue((q) => {
      if (q.length > 0) {
        const [next, ...rest] = q;
        timerRef.current = setTimeout(() => setCurrent(null), HINT_DISPLAY_MS);
        setCurrent(next);
        return rest;
      }
      setCurrent(null);
      return q;
    });
  }, []);

  const pushHint = useCallback(
    (hint: CoachingHint) => {
      analytics.capture(AnalyticsEvents.IN_CALL_HINT_SHOWN, {
        trigger: hint.trigger,
      });
      setCurrent((c) => {
        if (!c) {
          // No hint currently showing — display immediately
          timerRef.current = setTimeout(dismiss, HINT_DISPLAY_MS);
          return hint;
        }
        // A hint is already showing — queue this one
        setQueue((q) => [...q, hint]);
        return c;
      });
    },
    [analytics, dismiss],
  );

  const handleData = useCallback(
    (data: Uint8Array) => {
      try {
        const text = new TextDecoder().decode(data);
        const payload = JSON.parse(text);
        if (payload?.type === 'coaching_hint' && payload?.text) {
          pushHint({
            id: `hint-${Date.now()}`,
            text: payload.text,
            trigger: payload.trigger ?? 'unknown',
          });
        }
      } catch {
        // Ignore non-JSON packets (audio, other binary data)
      }
    },
    [pushHint],
  );

  useEffect(() => {
    if (!options?.onDataReceived) return;
    const unsubscribe = options.onDataReceived(handleData);
    return () => {
      unsubscribe?.();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [options?.onDataReceived, handleData]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return { current, dismiss, pushHint };
}
