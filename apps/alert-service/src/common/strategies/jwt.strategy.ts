import { JwtPayload } from '@alkatra/shared-types';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

/**
 * Utilisateur authentifié tel que rempli dans `req.user` après validation du JWT.
 * Les alertes sont isolées par `userId` — aucune donnée d'un autre utilisateur
 * n'est lisible via l'API publique.
 */
export interface AuthenticatedUser {
  userId: string;
  phone?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('app.jwt.secret'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    if (!payload.sub) {
      throw new UnauthorizedException(
        'Token JWT invalide : champ "sub" (userId) manquant.',
      );
    }

    return {
      userId: payload.sub,
      phone: payload.phone,
    };
  }
}
