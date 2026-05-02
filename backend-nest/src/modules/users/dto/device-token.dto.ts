import { IsString, IsIn } from 'class-validator';

export class DeviceTokenDto {
  @IsString()
  deviceToken: string;

  @IsIn(['ios', 'android'])
  platform: 'ios' | 'android';

  @IsString()
  pushProvider: string;
}
