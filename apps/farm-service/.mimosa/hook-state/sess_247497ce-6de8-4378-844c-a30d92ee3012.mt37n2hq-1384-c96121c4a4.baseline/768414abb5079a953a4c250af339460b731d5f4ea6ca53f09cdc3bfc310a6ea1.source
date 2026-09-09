import { Controller, Post, Get, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { ParcelsService } from './parcels.service';
import { CreateParcelDto } from './dto/create-parcel.dto';
import { UpdateParcelDto } from './dto/update-parcel.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('api/v1/parcels')
@UseGuards(JwtAuthGuard)
export class ParcelsController {
  constructor(private readonly parcelsService: ParcelsService) {}

  @Post()
  create(@Body() createParcelDto: CreateParcelDto, @CurrentUser('userId') userId: string) {
    return this.parcelsService.create(createParcelDto, userId);
  }

  @Get('farm/:farmId')
  findByFarm(@Param('farmId') farmId: string, @CurrentUser('userId') userId: string) {
    return this.parcelsService.findAllByFarm(farmId, userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.parcelsService.findOne(id, userId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateParcelDto: UpdateParcelDto, @CurrentUser('userId') userId: string) {
    return this.parcelsService.update(id, updateParcelDto, userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.parcelsService.remove(id, userId);
  }
}