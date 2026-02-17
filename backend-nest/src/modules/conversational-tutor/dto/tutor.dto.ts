import { IsString, IsNotEmpty } from 'class-validator';

export class StartSessionDto {
  @IsString()
  @IsNotEmpty()
  userId: string;
}

export class ProcessSpeechDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;

  @IsString()
  @IsNotEmpty()
  userId: string;
}

export class EndSessionDto {
  @IsString()
  @IsNotEmpty()
  sessionId: string;
}
