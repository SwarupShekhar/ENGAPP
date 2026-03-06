/**
 * Maps dominant_pronunciation_errors to human-readable feedback (no AI).
 * Used for cap notification banner and motivational message.
 */
import { Injectable } from '@nestjs/common';

const FEEDBACK_MAP: Record<string, string> = {
  w_to_v:
    'Focus on the W sound — your lips should form a circle, not touch your teeth',
  v_to_w_reversal:
    'Focus on the W sound — your lips should form a circle, not touch your teeth',
  th_to_t:
    'Work on the TH sound — place your tongue between your teeth',
  th_to_d:
    'Work on the TH sound — place your tongue between your teeth',
  o_to_aa:
    "Practice the short O sound — words like 'not', 'hot', 'morning'",
  ae_to_e:
    "Work on the short A sound — words like 'cat', 'can', 'apple'",
  i_to_ee:
    "Practice the short I sound — 'bit' and 'beat' are different words",
  h_dropping:
    "Remember to pronounce H at the start of words like 'house' and 'happy'",
  zh_to_j: 'Work on the ZH sound in words like "vision" and "measure"',
  z_to_j: 'Work on the Z vs J sound in words like "zero" and "vision"',
  r_rolling: 'Soften the R sound — avoid rolling or trilling',
  syllabic_lengthening: 'Keep vowel length natural — avoid over-lengthening',
  schwa_addition: 'Reduce extra "uh" sounds in unstressed syllables',
  schwa_reduction: 'Add a light "uh" in unstressed syllables where needed',
  schwa_prothesis: 'Avoid adding "uh" before words that start with a consonant',
};

const CAP_PREFIX =
  'Your grammar and vocabulary show one level higher potential, but consistent pronunciation patterns are holding your score back. ';

@Injectable()
export class PronunciationFeedbackService {
  /**
   * Build motivational feedback from dominant_pronunciation_errors.
   * If cefrCap is set, prepend the cap message.
   */
  getFeedbackMessage(
    dominantErrors: string[],
    cefrCap: 'A2' | 'B1' | null,
  ): string {
    const tips = dominantErrors
      .slice(0, 2)
      .map((key) => FEEDBACK_MAP[key] || `Work on ${key.replace(/_/g, ' ')}`)
      .filter(Boolean);
    const body = tips.length > 0 ? tips.join(' ') : 'Keep practicing pronunciation.';
    if (cefrCap) {
      return CAP_PREFIX + body;
    }
    return body;
  }

  /**
   * Short message for cap banner (e.g. "Fix your W and TH sounds to reach B1").
   */
  getCapBannerMessage(
    dominantErrors: string[],
    targetLevel: 'A2' | 'B1',
  ): string {
    const parts = dominantErrors.slice(0, 2).map((key) => {
      if (key === 'w_to_v' || key === 'v_to_w_reversal') return 'W';
      if (key === 'th_to_t' || key === 'th_to_d') return 'TH';
      return key.replace(/_/g, ' ');
    });
    const fix = parts.length > 0 ? parts.join(' and ') : 'pronunciation';
    return `Fix your ${fix} sounds to reach ${targetLevel}.`;
  }
}
