import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { OtpService } from './otp.service';
import { redisProvider } from './redis.provider';
import { SmsProviderService } from './sms-provider.service';

@Module({
  imports: [HttpModule],
  providers: [OtpService, redisProvider, SmsProviderService],
  exports: [OtpService, SmsProviderService],
})
export class OtpModule {}