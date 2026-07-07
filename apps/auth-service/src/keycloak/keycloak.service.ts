import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import { KeycloakConfig } from './keycloak.config';

/**
 * Préparation Phase 2 : ce service NE gère PAS l'authentification produit en Phase 1
 * (celle-ci repose sur le JWT natif NestJS, cf. auth.service.ts / jwt.strategy.ts).
 * Il permet uniquement de vérifier que le realm/client Keycloak sont bien configurés,
 * en amont de la bascule OIDC prévue en Phase 2.
 */
@Injectable()
export class KeycloakService {
  private readonly logger = new Logger(KeycloakService.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly config: KeycloakConfig,
  ) {}

  async getAdminToken(): Promise<string> {
    const url = `${this.config.baseUrl}/realms/master/protocol/openid-connect/token`;
    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: this.config.adminUsername,
      password: this.config.adminPassword,
    });

    try {
      const response = await firstValueFrom(
        this.httpService.post(url, body.toString(), {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 10000,
        }),
      );
      return response.data.access_token;
    } catch (error) {
      this.logger.error(
        `Impossible d'obtenir un token admin Keycloak : ${(error as AxiosError).message}`,
      );
      throw error;
    }
  }

  async realmExists(realmName: string): Promise<boolean> {
    const token = await this.getAdminToken();
    try {
      await firstValueFrom(
        this.httpService.get(`${this.config.baseUrl}/admin/realms/${realmName}`, {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 10000,
        }),
      );
      return true;
    } catch (error) {
      if ((error as AxiosError).response?.status === 404) {
        return false;
      }
      throw error;
    }
  }

  async clientExists(realmName: string, clientId: string): Promise<boolean> {
    const token = await this.getAdminToken();
    const response = await firstValueFrom(
      this.httpService.get(
        `${this.config.baseUrl}/admin/realms/${realmName}/clients`,
        {
          headers: { Authorization: `Bearer ${token}` },
          params: { clientId },
          timeout: 10000,
        },
      ),
    );
    return Array.isArray(response.data) && response.data.length > 0;
  }
}