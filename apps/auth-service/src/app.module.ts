import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import configuration from './config/configuration';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { OtpModule } from './otp/otp.module';
import { KeycloakModule } from './keycloak/keycloak.module';
import { UserModule } from './user/user.module';
import { UserEntity } from './auth/entities/user.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get<string>('database.url'),
        entities: [UserEntity],
        synchronize: false,
        autoLoadEntities: true,
      }),
    }),
    AuthModule,
    OtpModule,
    KeycloakModule,
    UserModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
