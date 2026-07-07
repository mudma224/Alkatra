import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UserEntity } from './entities/user.entity';

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

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

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
}