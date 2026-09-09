import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { AuthenticatedUser } from '../common/strategies/jwt.strategy';
import { FeedbackDto } from '../dto/feedback.dto';
import { FarmClientService } from './farm-client.service';
import { RecommendationsService } from './recommendations.service';

@Controller('api/v1/recommendations')
@UseGuards(JwtAuthGuard)
export class RecommendationsController {
  constructor(
    private readonly service: RecommendationsService,
    private readonly farmClient: FarmClientService,
  ) {}

  @Get('parcel/:parcelId/today')
  async getToday(
    @Param('parcelId', ParseUUIDPipe) parcelId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    await this.farmClient.assertParcelOwnership(parcelId, user.authorization);
    return this.service.findTodayByParcel(parcelId);
  }

  /** Historique paginé des recommandations d'une parcelle */
  @Get('parcel/:parcelId/history')
  async getHistory(
    @Param('parcelId', ParseUUIDPipe) parcelId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit', new DefaultValuePipe(30), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    await this.farmClient.assertParcelOwnership(parcelId, user.authorization);
    return this.service.findHistoryByParcel(parcelId, limit, offset);
  }

  /** Feedback de l'agriculteur sur une recommandation */
  @Patch(':id/feedback')
  async submitFeedback(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: FeedbackDto,
  ) {
    const parcelId = await this.service.getParcelIdOf(id);
    await this.farmClient.assertParcelOwnership(parcelId, user.authorization);
    return this.service.submitFeedback(id, dto);
  }

  /** Marquer une recommandation comme exécutée (irrigation déclenchée) */
  @Patch(':id/execute')
  async execute(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const parcelId = await this.service.getParcelIdOf(id);
    await this.farmClient.assertParcelOwnership(parcelId, user.authorization);
    return this.service.markAsExecuted(id);
  }
}