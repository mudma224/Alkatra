import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from './entities/user.entity';
import { OtpService } from '../otp/otp.service';
import { SmsProviderService } from '../otp/sms-provider.service';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface RefreshTokenPayload {
  sub: string;
  phone: string;
}

export interface AuthResult extends TokenPair {
  user: {
    id: string;
    phone: string;
    name: string | null;
    preferredLanguage: string;
    createdAt: Date;
  };
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly otpService: OtpService,
    private readonly smsProviderService: SmsProviderService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async requestOtp(phone: string): Promise<{ expiresAt: Date }> {
    const code = await this.otpService.generateAndStore(phone);
    await this.smsProviderService.sendOtp(phone, code);

    const ttlSeconds = this.configService.get<number>('otp.ttlSeconds') ?? 300;
    return { expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
  }

  async verifyOtpAndAuthenticate(phone: string, otp: string): Promise<AuthResult> {
    if (await this.otpService.isBlocked(phone)) {
      throw new UnauthorizedException(
        'Trop de tentatives échouées. Veuillez réessayer plus tard.',
      );
    }

    const isValid = await this.otpService.verify(phone, otp);
    if (!isValid) {
      throw new UnauthorizedException('Code OTP invalide ou expiré');
    }

    let user = await this.userRepository.findOne({ where: { phone } });
    if (!user) {
      user = this.userRepository.create({ phone });
      user = await this.userRepository.save(user);
      this.logger.log(`Nouvel utilisateur créé : ${user.id}`);
    }

    user.lastLoginAt = new Date();
    await this.userRepository.save(user);

    const tokens = this.generateTokenPair(user);
    return { ...tokens, user: this.toUserResponse(user) };
  }

  async refreshSession(phone: string, refreshToken: string): Promise<AuthResult> {
    const payload = this.verifyRefreshToken(refreshToken);

    if (payload.phone !== phone) {
      throw new UnauthorizedException('Refresh token incohérent avec le téléphone fourni');
    }

    const user = await this.userRepository.findOne({ where: { phone } });
    if (!user) {
      throw new UnauthorizedException('Utilisateur introuvable');
    }

    const tokens = this.generateTokenPair(user);
    return { ...tokens, user: this.toUserResponse(user) };
  }

  generateTokenPair(user: UserEntity): TokenPair {
    const accessExpiration =
      this.configService.get<number>('jwt.accessExpiration') ?? 3600;
    const refreshExpiration =
      this.configService.get<number>('jwt.refreshExpiration') ?? 2592000;

    const payload = { sub: user.id, phone: user.phone };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn: accessExpiration,
      algorithm: 'HS256',
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: refreshExpiration,
      algorithm: 'HS256',
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: accessExpiration,
      tokenType: 'Bearer',
    };
  }

  verifyRefreshToken(refreshToken: string): RefreshTokenPayload {
    try {
      return this.jwtService.verify<RefreshTokenPayload>(refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret'),
        algorithms: ['HS256'],
      });
    } catch (error) {
      this.logger.warn(`Refresh token invalide ou expiré : ${(error as Error).message}`);
      throw new UnauthorizedException('Refresh token invalide ou expiré');
    }
  }

  private toUserResponse(user: UserEntity) {
    return {
      id: user.id,
      phone: user.phone,
      name: user.name,
      preferredLanguage: user.preferredLanguage,
      createdAt: user.createdAt,
    };
  }
}