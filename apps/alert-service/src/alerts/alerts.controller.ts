import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AlertsService } from './alerts.service';
import { ListAlertsQueryDto } from './dto/list-alerts.query.dto';

/**
 * API publique des alertes (frontend, polling via la gateway). Toutes les
 * routes sont isolées par l'utilisateur du JWT.
 */
@Controller('api/v1/alerts')
@UseGuards(JwtAuthGuard)
export class AlertsController {
  constructor(private readonly alertsService: AlertsService) {}

  @Get()
  findAll(
    @CurrentUser('userId') userId: string,
    @Query() query: ListAlertsQueryDto,
  ) {
    return this.alertsService.findAll(userId, query);
  }

  @Get('unread-count')
  async countUnread(@CurrentUser('userId') userId: string) {
    const count = await this.alertsService.countUnread(userId);
    return { count };
  }

  @Patch('read-all')
  @HttpCode(200)
  markAllRead(@CurrentUser('userId') userId: string) {
    return this.alertsService.markAllRead(userId);
  }

  @Patch(':id/read')
  @HttpCode(200)
  markRead(
    @CurrentUser('userId') userId: string,
    @Param('id', ParseUUIDPipe) alertId: string,
  ) {
    return this.alertsService.markRead(userId, alertId);
  }
}
