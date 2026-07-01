-- User-selectable Kitten TTS voice for daily listen + Maya short acks.
ALTER TABLE "User" ADD COLUMN "dailyListenVoice" TEXT NOT NULL DEFAULT 'Kiki';
ALTER TABLE "User" ADD COLUMN "dailyListenVoiceChosen" BOOLEAN NOT NULL DEFAULT false;

-- Existing users keep Kiki and skip the first-launch voice picker.
UPDATE "User" SET "dailyListenVoiceChosen" = true WHERE "dailyListenVoiceChosen" = false;
