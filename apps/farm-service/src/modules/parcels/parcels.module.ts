import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ParcelsController } from './parcels.controller';
import { InternalParcelsController } from './internal-parcels.controller';
import { ParcelsService } from './parcels.service';
import { Parcel } from '../../database/entities/parcel.entity';
import { Farm } from '../../database/entities/farm.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Parcel, Farm]),
  ],
  controllers: [ParcelsController, InternalParcelsController],
  providers: [ParcelsService],
  exports: [ParcelsService],
})
export class ParcelsModule {}