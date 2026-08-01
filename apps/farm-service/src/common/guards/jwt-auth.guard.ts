import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  canActivate(context) {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const url = request.url;
    const ip = request.ip || request.connection?.remoteAddress || 'unknown';

    this.logger.debug(
      `Tentative d'acces - Methode: ${method}, URL: ${url}, IP: ${ip}`,
    );

    return super.canActivate(context);
  }

  handleRequest(err, user, info) {
    if (err) {
      this.logger.error(`Erreur d'authentification : ${err.message}`);
      throw err;
    }

    if (!user) {
      const message = info?.message || 'Token JWT absent ou invalide';
      this.logger.warn(`Acces non autorise : ${message}`);

      throw new UnauthorizedException(
        'Non autorise - Le token JWT est absent, expire ou invalide.',
      );
    }

    this.logger.debug(`Acces autorise pour userId: ${user.userId}`);
    return user;
  }
}