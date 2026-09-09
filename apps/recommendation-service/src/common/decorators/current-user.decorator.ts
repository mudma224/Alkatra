import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticatedUser } from '../strategies/jwt.strategy';

export const CurrentUser = createParamDecorator(
  (data: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<Request>();

    // req.user est rempli par Passport après validation du JWT
    const user = req.user as AuthenticatedUser;

    // Récupère aussi le header authorization brut pour le forward au farm-service
    if (user && !user.authorization) {
      user.authorization = (req.headers['authorization'] as string) ?? '';
    }

    return data ? user?.[data] : user;
  },
);