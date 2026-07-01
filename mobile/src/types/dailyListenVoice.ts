export type DailyListenVoice = 'Kiki' | 'Jasper';

export type DailyListenAudioMap = Partial<Record<DailyListenVoice, string>>;

export interface ListenVoicePreference {
  voice: DailyListenVoice;
  chosen: boolean;
}

export const DAILY_LISTEN_VOICES: DailyListenVoice[] = ['Kiki', 'Jasper'];
