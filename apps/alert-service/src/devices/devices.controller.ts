import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { DevicesService } from './devices.service';
import { RegisterDeviceDto } from './dto/register-device.dto';

/**
 * Enregistrement des tokens push (FCM) pour l'utilisateur connecté —
 * prérequis pour recevoir les notifications push. Le frontend appellera cet
 * endpoint après l'obtention du token côté SDK Firebase.
 */
@Controller('api/v1/devices')
@UseGuards(JwtAuthGuard)
export class DevicesController {
  constructor(private readonly devicesService: DevicesService) {}

  @Post()
  async register(
    @CurrentUser('userId') userId: string,
    @Body() dto: RegisterDeviceDto,
  ) {
    return this.devicesService.register(userId, dto);
  }

  @Delete(':token')
  @HttpCode(204)
  async revoke(
    @CurrentUser('userId') userId: string,
    @Param('token') token: string,
  ) {
    await this.devicesService.revoke(userId, token);
  }
}
