import { IsNotEmpty, IsString } from 'class-validator';

export class InternalProvisionDto {
  @IsString()
  @IsNotEmpty()
  clerkId: string;

  @IsString()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  fullName: string;
}

