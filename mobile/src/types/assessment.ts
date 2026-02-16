export interface MispronuncedWord {
    word: string;
    accuracy: number;
    error_type: string;
    position_in_text: number;
}

export interface WeakPhoneme {
    word: string;
    phoneme: string;
    score: number;
    ipa_symbol: string;
}

export interface DetailedPronunciationFeedback {
    mispronounced_words: MispronuncedWord[];
    weak_phonemes: WeakPhoneme[];
    problem_sounds: Record<string, number>;
    omitted_words: string[];
    inserted_words: string[];
    word_level_scores: Array<{
        word: string;
        accuracy: number;
        error_type: string;
        position: number;
    }>;
}

export interface ActionableFeedback {
    practice_words: string[];
    phoneme_tips: string[];
    accent_specific_tips: string[];
    strengths: string[];
}

export interface GrammarError {
    text: string;
    error_type: string;
    correction: string;
    severity: 'major' | 'minor';
}

export interface VocabularyAnalysis {
    score: number;
    word_count: number;
    unique_words: number;
    advanced_words: string[];
    repetitions: Record<string, number>;
    inappropriate_words: Record<string, string>;
    cefr_level: string;
    justification: string;
}

export interface GrammarAnalysis {
    score: number;
    errors: GrammarError[];
    strengths: string[];
    cefr_level: string;
    justification: string;
}

export interface AccentAnalysis {
    l1_influence: string;
    specific_markers: string[];
    accent_notes: string;
}

export interface DetailedAIFeedback {
    grammar: GrammarAnalysis;
    vocabulary: VocabularyAnalysis;
    fluency: {
        score: number;
        filler_words: string[];
        sentence_completeness: string;
        coherence: string;
        justification: string;
    };
    accent_analysis: AccentAnalysis;
    overall_feedback: {
        strengths: string[];
        priority_improvements: string[];
        practice_recommendations: string[];
    };
}

export interface WordScore {
    word: string;
    accuracy: number;
    error_type: string;
    position: number;
}
