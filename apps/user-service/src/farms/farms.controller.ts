// apps/user-service/src/farms/farms.controller.ts

import { Controller, Get, NotImplementedException, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('farms')
@UseGuards(JwtAuthGuard)
export class FarmsController {
  @Get()
  findAll() {
    throw new NotImplementedException('Farms listing is not implemented yet');
  }
}
