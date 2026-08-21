import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  private readonly logger = new Logger(JwtAuthGuard.name);

  canActivate(context: import('@nestjs/common').ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const method = request.method;
    const url = request.url;

    this.logger.debug(`Tentative d'accès — Méthode: ${method}, URL: ${url}`);

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any) {
    if (err) {
      this.logger.error(`Erreur d'authentification : ${err.message}`);
      throw err;
    }

    if (!user) {
      const message = info?.message || 'Token JWT absent ou invalide';
      this.logger.warn(`Accès non autorisé : ${message}`);

      throw new UnauthorizedException(
        'Non autorisé — Le token JWT est absent, expiré ou invalide.',
      );
    }

    this.logger.debug(`Accès autorisé pour userId: ${user.userId}`);
    return user;
  }
}
