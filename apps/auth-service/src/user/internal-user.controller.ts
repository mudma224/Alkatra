import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { InternalUserService } from './internal-user.service';

/**
 * Contrôleur INTERNE — réservé aux appels service-à-service.
 * Non exposé via l'API Gateway. Accessible uniquement depuis le réseau interne Docker.
 * user-service appelle ces endpoints au lieu d'accéder directement à PostgreSQL.
 */
@Controller('internal/user')
export class InternalUserController {
  constructor(private readonly internalUserService: InternalUserService) {}

  @Get(':userId')
  async getProfile(@Param('userId') userId: string) {
    return this.internalUserService.getProfile(userId);
  }

  @Patch(':userId')
  async updateProfile(
    @Param('userId') userId: string,
    @Body() data: { name?: string | null; preferredLanguage?: 'fr' | 'ar' | 'darija' },
  ) {
    return this.internalUserService.updateProfile(userId, data);
  }
}