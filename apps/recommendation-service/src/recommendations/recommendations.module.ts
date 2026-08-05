import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Recommendation } from '../entities/recommendation.entity';
import { JwtStrategy } from '../common/strategies/jwt.strategy';
import { FarmClientService } from './farm-client.service';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Recommendation]),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('app.jwt.secret'),
        signOptions: { expiresIn: '3600s' },
      }),
    }),
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        timeout: config.get<number>('app.farmService.timeoutMs'),
        maxRedirects: 0,
      }),
    }),
  ],
  controllers: [RecommendationsController],
  providers: [RecommendationsService, FarmClientService, JwtStrategy],
  exports: [RecommendationsService],
})
export class RecommendationsModule {}