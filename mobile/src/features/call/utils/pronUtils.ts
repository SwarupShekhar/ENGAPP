export type PronIssueNormalized = {
  id: string;
  correct: string;
  spoken: string;
  rule_category: string;
  confidence?: number;
  word_index?: number;
  suggestion?: string;
  reel_id?: string;
};

export function getPronUI(ruleCategory: string) {
  const cat = (ruleCategory || "").trim();
  const vowel =
    cat === "i_to_ee" ||
    cat === "ae_to_e" ||
    cat === "o_to_aa" ||
    cat.includes("vowel");

  if (cat === "th_to_d") return { bg: "#FCEBEB", text: "#A32D2D", key: "TH" };
  if (cat === "th_to_t") return { bg: "#FCEBEB", text: "#A32D2D", key: "TH" };
  if (cat === "v_to_w" || cat === "v_to_b" || cat === "w_to_v" || cat === "v_to_w_reversal")
    return { bg: "#FAEEDA", text: "#633806", key: "VW" };
  if (vowel) return { bg: "#EEEDFE", text: "#3C3489", key: "V" };
  if (cat === "r_rolling") return { bg: "#E1F5EE", text: "#085041", key: "R" };
  return { bg: "#F1F5F9", text: "#475569", key: "PR" };
}

export function getPronLabel(ruleCategory: string) {
  const cat = (ruleCategory || "").trim();
  if (cat === "th_to_d" || cat === "th_to_t") return "th sound";
  if (cat === "v_to_b" || cat === "v_to_w" || cat === "w_to_v" || cat === "v_to_w_reversal")
    return "v vs w/b";
  if (cat === "i_to_ee" || cat.includes("vowel")) return "short i vowel";
  if (cat === "r_rolling") return "r sound";
  if (cat === "general_mispronunciation") return "mispronounced";
  return cat ? cat.replace(/_/g, " ") : "pronunciation";
}

export function getPronFix(ruleCategory: string) {
  const cat = (ruleCategory || "").trim();
  if (cat === "th_to_d" || cat === "th_to_t")
    return "Place tongue tip lightly between teeth and breathe out.";
  if (cat === "v_to_b" || cat === "v_to_w" || cat === "w_to_v" || cat === "v_to_w_reversal")
    return "Touch upper teeth to lower lip, then vibrate.";
  if (cat === "i_to_ee" || cat.includes("vowel"))
    return "Keep the vowel short and relaxed, don't stretch it.";
  if (cat === "r_rolling") return "Curl tongue back slightly, don't trill.";
  return "Listen to a native speaker and repeat slowly.";
}

/**
 * Coaching line for TTS — matches backend narration_service.coaching_line.
 * Never drops when spoken === correct (ASR may match the target while sound is wrong).
 * Tips are usually spoken once on segment intro, not per issue (includeTip=false).
 */
export function buildPronCoachingLine({
  spoken,
  correct,
  ruleCategory,
  firstName,
  includeTip = false,
}: {
  spoken?: string | null;
  correct: string;
  ruleCategory?: string | null;
  firstName?: string;
  includeTip?: boolean;
}): string {
  const tip = getPronFix(ruleCategory ?? "");
  const name = firstName ? `${firstName}, ` : "";
  const spokenTrimmed = (spoken ?? "").trim();
  const correctTrimmed = (correct ?? "").trim();
  const spokenW =
    spokenTrimmed && spokenTrimmed !== "—" ? spokenTrimmed : "";
  const target = correctTrimmed || spokenW || "the right word";
  const hasContrast =
    !!spokenW && spokenW.toLowerCase() !== target.toLowerCase();

  const line = hasContrast
    ? `${name}You said "${spokenW}". Try saying "${target}".`
    : `${name}Your word "${target}" wasn't clear. Say "${target}" like this.`;
  return includeTip ? `${line} ${tip}` : line;
}

/** Correct word for slow-model TTS (never the wrong word). */
export function slowCorrectWord(correct: string): string {
  return (correct ?? "").trim();
}
