import { IsEnum, IsString, MaxLength, MinLength } from 'class-validator';
import { DEVICE_PLATFORMS, type DevicePlatformValue } from '../../database/entities/device-token.entity';

export class RegisterDeviceDto {
  /** Token FCM délivré par le SDK client Firebase. */
  @IsString()
  @MinLength(20)
  @MaxLength(255)
  token: string;

  @IsEnum(DEVICE_PLATFORMS)
  platform: DevicePlatformValue;
}
