import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class KeycloakConfig {
  constructor(private readonly configService: ConfigService) {}

  get baseUrl(): string {
    return this.configService.get<string>('keycloak.url') ?? 'http://keycloak:8080';
  }

  get realm(): string {
    return this.configService.get<string>('keycloak.realm') ?? 'alkatra';
  }

  get clientId(): string {
    return this.configService.get<string>('keycloak.clientId') ?? 'alkatra-web';
  }

  get adminUsername(): string {
    return this.configService.get<string>('KEYCLOAK_ADMIN') ?? 'admin';
  }

  get adminPassword(): string {
    return this.configService.get<string>('KEYCLOAK_ADMIN_PASSWORD') ?? '';
  }
}