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
