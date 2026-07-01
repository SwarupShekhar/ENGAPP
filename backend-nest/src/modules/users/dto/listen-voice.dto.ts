import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export class UpdateListenVoiceDto {
  @IsOptional()
  @IsIn(['Kiki', 'Jasper'])
  voice?: 'Kiki' | 'Jasper';

  @IsOptional()
  @IsBoolean()
  chosen?: boolean;
}
