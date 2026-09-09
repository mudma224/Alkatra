import { Controller, Post, Get, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common';
import { FarmsService } from './farms.service';
import { CreateFarmDto } from './dto/create-farm.dto';
import { UpdateFarmDto } from './dto/update-farm.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('api/v1/farms')
@UseGuards(JwtAuthGuard)
export class FarmsController {
  constructor(private readonly farmsService: FarmsService) {}

  @Post()
  create(@Body() createFarmDto: CreateFarmDto, @CurrentUser() user: { userId: string }) {
    return this.farmsService.create(createFarmDto, user.userId);
  }

  @Get()
  findAll(@CurrentUser('userId') userId: string) {
    return this.farmsService.findAllByOwner(userId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.farmsService.findOne(id, userId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateFarmDto: UpdateFarmDto, @CurrentUser('userId') userId: string) {
    return this.farmsService.update(id, updateFarmDto, userId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser('userId') userId: string) {
    return this.farmsService.remove(id, userId);
  }
}