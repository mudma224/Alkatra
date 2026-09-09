import { Module } from '@nestjs/common';
import { ExplanationService } from './explanation.service';

@Module({
  providers: [ExplanationService],
  exports: [ExplanationService],
})
export class ExplanationModule {}