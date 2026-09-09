import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ObservabilityModule } from '@alkatra/observability';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { FarmsModule } from './farms/farms.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ObservabilityModule.forRoot({ prefix: 'user' }),
    UserModule,
    AuthModule,
    FarmsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}