/**
 * Unified fluency breakdown from backend (PA assess + CQS).
 */
export interface FluencyBreakdown {
  speech_flow: number;
  connected_speech?: number;
  naturalness?: number;
  prosody: number;
  pace_control: number;
  paceScore?: number;
  wpm: number;
  fillerCount: number;
  topFillers: string[];
  components?: {
    speech_flow: number;
    connected_speech: number;
    prosody: number;
    pace_control: number;
  };
  examples?: {
    linking_detected?: string[];
    reductions_detected?: string[];
  };
  connected_speech_details?: Record<string, number>;
  overall_fluency?: number;
  azure_raw_fluency?: number;
  azure_raw_prosody?: number;
  pause_count?: number;
}

export function paceLabel(wpm: number): string {
  if (wpm >= 130 && wpm <= 170) return "Ideal";
  if (wpm < 80) return "Very slow";
  if (wpm < 100) return "Slow";
  if (wpm > 200) return "Very fast";
  if (wpm > 180) return "Fast";
  return "OK";
}

export function paceColor(wpm: number): string {
  if (wpm >= 130 && wpm <= 170) return "#26A69A";
  if (wpm < 100 || wpm > 180) return "#F59E0B";
  return "#64748B";
}
