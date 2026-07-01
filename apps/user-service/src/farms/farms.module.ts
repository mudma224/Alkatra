// apps/user-service/src/farms/farms.module.ts

import { Module } from '@nestjs/common';
import { FarmsController } from './farms.controller';

@Module({
  controllers: [FarmsController],
})
export class FarmsModule {}
