import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { OtpService } from './otp.service';
import { REDIS_CLIENT, redisProvider } from './redis.provider';
import { SmsProviderService } from './sms-provider.service';

@Module({
  imports: [HttpModule],
  providers: [OtpService, redisProvider, SmsProviderService],
  exports: [OtpService, SmsProviderService, REDIS_CLIENT],
})
export class OtpModule {}