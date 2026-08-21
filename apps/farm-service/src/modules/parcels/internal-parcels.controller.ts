import { Controller, Get, Param, UseGuards } from '@nestjs/common';

import { ParcelsService } from './parcels.service';
import { InternalTokenGuard } from '../../common/guards/internal-token.guard';

/**
 * Endpoints internes parcelle — appelés par alert-service pour résoudre une
 * parcelle vers son propriétaire sans contexte utilisateur (flux Kafka),
 * jamais exposés par la gateway (le préfixe /internal n'y est pas routé).
 */
@Controller('internal/parcels')
@UseGuards(InternalTokenGuard)
export class InternalParcelsController {
  constructor(private readonly parcelsService: ParcelsService) {}

  @Get(':parcelId/owner')
  async findOwner(@Param('parcelId') parcelId: string) {
    return this.parcelsService.findParcelOwner(parcelId);
  }
}
