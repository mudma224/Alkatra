import { Controller, Patch, Param, Body, UseGuards } from '@nestjs/common';

import { SensorsService } from './sensors.service';
import { SensorHeartbeatDto } from './dto/sensor-heartbeat.dto';
import { InternalTokenGuard } from '../../common/guards/internal-token.guard';

/**
 * Endpoints internes capteur — appelés par l'iot-service, jamais exposés par
 * la gateway (le préfixe /internal n'y est pas routé). Voir InternalTokenGuard
 * pour la protection (isolation réseau Docker + token optionnel).
 */
@Controller('internal/sensors')
@UseGuards(InternalTokenGuard)
export class InternalSensorsController {
  constructor(private readonly sensorsService: SensorsService) {}

  @Patch(':deviceId/seen')
  seen(@Param('deviceId') deviceId: string, @Body() heartbeatDto: SensorHeartbeatDto) {
    return this.sensorsService.recordHeartbeat(deviceId, heartbeatDto);
  }
}
