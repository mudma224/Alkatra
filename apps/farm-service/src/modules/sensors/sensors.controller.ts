import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { SensorsService } from './sensors.service';
import { AssociateSensorDto } from './dto/associate-sensor.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('api/v1/sensors')
@UseGuards(JwtAuthGuard)
export class SensorsController {
  constructor(private readonly sensorsService: SensorsService) {}

  @Post('associate')
  associate(@Body() associateSensorDto: AssociateSensorDto, @CurrentUser('userId') userId: string) {
    return this.sensorsService.associate(associateSensorDto, userId);
  }
}