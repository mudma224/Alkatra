import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Recommendation } from '../entities/recommendation.entity';
import { ExplanationModule } from '../explanation/explanation.module';
import { MetricsModule } from '../metrics/metrics.module';
import { DoubleWriteService } from './double-write.service';
import { SyncConsumerService } from './sync-consumer.service';

@Module({
  imports: [TypeOrmModule.forFeature([Recommendation]), ExplanationModule, MetricsModule],
  providers: [DoubleWriteService, SyncConsumerService],
  exports: [DoubleWriteService, SyncConsumerService],
})
export class SyncModule {}