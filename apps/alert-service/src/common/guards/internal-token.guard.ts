import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';

/**
 * Protège les endpoints inter-services (/internal/*) — jamais routés par la
 * gateway. Même contrat que farm-service : le header X-Internal-Token doit
 * correspondre à INTERNAL_TOKEN ; si la variable n'est pas définie, la garde
 * laisse passer (l'isolation réseau Docker est la protection en dev).
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
