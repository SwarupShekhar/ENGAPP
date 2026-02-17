export class StartSessionDto {
  userId: string;
}

export class ProcessSpeechDto {
  sessionId: string;
  userId: string;
}

export class EndSessionDto {
  sessionId: string;
}
