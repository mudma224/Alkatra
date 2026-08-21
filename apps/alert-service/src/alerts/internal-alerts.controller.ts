import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { InternalTokenGuard } from '../common/guards/internal-token.guard';
import { AlertDispatcher } from './alert-dispatcher.service';
import { DispatchAlertDto } from './dto/dispatch-alert.dto';

/**
 * Endpoint interne d'ingestion d'alertes — appelé par les services métier
 * (ex: farm-service pour sensor_offline / low_battery), jamais exposé par la
 * gateway (le préfixe /internal n'y est pas routé).
 *
 * Réponses : 201 alerte créée · 401 token interne invalide ·
 * 409 dédup (alerte identique déjà émise < fenêtre) — toléré silencieusement
 * par les appelants.
 */
@Controller('internal/alerts')
@UseGuards(InternalTokenGuard)
export class InternalAlertsController {
  constructor(private readonly dispatcher: AlertDispatcher) {}

  @Post()
  dispatch(@Body() dto: DispatchAlertDto) {
    return this.dispatcher.dispatch(dto);
  }
}
