import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.provider';

@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);

  private readonly ttlSeconds: number;
  private readonly maxAttempts: number;
  private readonly blockDurationSeconds: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
  ) {
    this.ttlSeconds = this.configService.get<number>('otp.ttlSeconds') ?? 300;
    this.maxAttempts = this.configService.get<number>('otp.maxAttempts') ?? 3;
    this.blockDurationSeconds =
      this.configService.get<number>('otp.blockDurationSeconds') ?? 1800;
  }

  private otpKey(phone: string): string {
    return `otp:${phone}`;
  }

  private attemptsKey(phone: string): string {
    return `otp:attempts:${phone}`;
  }

  private blockedKey(phone: string): string {
    return `otp:blocked:${phone}`;
  }

  private generateSixDigitCode(): string {
    const code = Math.floor(Math.random() * 1_000_000);
    return code.toString().padStart(6, '0');
  }

  async generateAndStore(phone: string): Promise<string> {
    const code = this.generateSixDigitCode();
    await this.redis.set(this.otpKey(phone), code, 'EX', this.ttlSeconds);
    await this.redis.del(this.attemptsKey(phone));
    this.logger.debug(`OTP generated for ${phone} (TTL ${this.ttlSeconds}s)`);
    return code;
  }

  async isBlocked(phone: string): Promise<boolean> {
    const blocked = await this.redis.get(this.blockedKey(phone));
    return blocked !== null;
  }

  async verify(phone: string, submittedCode: string): Promise<boolean> {
    const storedCode = await this.redis.get(this.otpKey(phone));

    if (!storedCode || storedCode !== submittedCode) {
      const attempts = await this.redis.incr(this.attemptsKey(phone));
      await this.redis.expire(this.attemptsKey(phone), this.ttlSeconds);

      if (attempts >= this.maxAttempts) {
        await this.redis.set(
          this.blockedKey(phone),
          '1',
          'EX',
          this.blockDurationSeconds,
        );
        this.logger.warn(`Phone ${phone} blocked after ${attempts} failed OTP attempts`);
      }
      return false;
    }

    await this.clear(phone);
    return true;
  }

  async clear(phone: string): Promise<void> {
    await this.redis.del(this.otpKey(phone));
    await this.redis.del(this.attemptsKey(phone));
  }
}