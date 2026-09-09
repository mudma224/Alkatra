import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FarmsController } from './farms.controller';
import { FarmsService } from './farms.service';
import { Farm } from '../../database/entities/farm.entity';
import { Parcel } from '../../database/entities/parcel.entity';
import { AuthClientModule } from '../../auth/auth-client.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Farm, Parcel]),
    AuthClientModule,
  ],
  controllers: [FarmsController],
  providers: [FarmsService],
  exports: [FarmsService],
})
export class FarmsModule {}