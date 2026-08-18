import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';

/**
 * Garde des endpoints internes (préfixe /internal/*, non routé par la gateway).
 *
 * Ces endpoints ne sont joignables que depuis le réseau Docker des services.
 * Si la variable INTERNAL_TOKEN est définie, un header X-Internal-Token
 * correspondant est exigé en plus ; si elle est absente (développement),
 * l'isolation réseau fait office de protection.
 */
@Injectable()
export class InternalTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.INTERNAL_TOKEN;
    if (!expected) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    if (request.headers?.['x-internal-token'] === expected) {
      return true;
    }

    throw new HttpException('Accès interne non autorisé.', HttpStatus.UNAUTHORIZED);
  }
}
