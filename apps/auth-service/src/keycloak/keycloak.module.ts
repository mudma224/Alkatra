import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { KeycloakConfig } from './keycloak.config';
import { KeycloakService } from './keycloak.service';

@Module({
  imports: [HttpModule],
  providers: [KeycloakConfig, KeycloakService],
  exports: [KeycloakService],
})
export class KeycloakModule {}