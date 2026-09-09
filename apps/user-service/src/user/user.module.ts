import { Module } from '@nestjs/common';
import { UserService } from './user.service';
import { UserController } from './user.controller';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [MetricsModule],
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}