import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { AuthClientService } from './auth-client.service';
import { JwtStrategy } from '../common/strategies/jwt.strategy';

@Module({
  imports: [
    ConfigModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    HttpModule.register({
      timeout: 5000,
    }),
  ],
  providers: [AuthClientService, JwtStrategy],
  exports: [AuthClientService, PassportModule],
})
export class AuthClientModule {}