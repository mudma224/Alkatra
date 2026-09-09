import { Injectable, Logger, HttpException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { AxiosResponse } from 'axios';

export interface AuthUserInfo {
  id: string;
  phone: string;
  name: string | null;
  preferredLanguage: string;
}

@Injectable()
export class AuthClientService {
  private readonly logger = new Logger(AuthClientService.name);
  private readonly authServiceUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.authServiceUrl = this.configService.get<string>('app.authServiceUrl') ||
      'http://auth-service:3001';
  }

  async verifyUserExists(userId: string): Promise<boolean> {
    this.logger.debug(`Vérification existence utilisateur: ${userId}`);

    try {
      await this.httpService.get<AuthUserInfo>(
        `${this.authServiceUrl}/internal/user/${userId}`,
      ).toPromise();

      this.logger.debug(`Utilisateur ${userId} vérifié avec succès`);
      return true;
    } catch (error: any) {
      if (error.response?.status === 404) {
        this.logger.warn(`Utilisateur ${userId} introuvable dans auth-service`);
        return false;
      }

      this.logger.error(
        `Erreur lors de la vérification utilisateur ${userId}: ${error.message}`,
      );

      throw new HttpException(
        'Service d\'authentification temporairement indisponible. Veuillez réessayer.',
        503,
      );
    }
  }

  async getUserInfo(userId: string): Promise<AuthUserInfo | null> {
    try {
      const response = await this.httpService.get<AuthUserInfo>(
        `${this.authServiceUrl}/internal/user/${userId}`,
      ).toPromise() as AxiosResponse<AuthUserInfo> | undefined;
      return response?.data ?? null;
    } catch (error: any) {
      if (error.response?.status === 404) {
        return null;
      }
      this.logger.error(
        `Erreur getUserInfo(${userId}): ${error.message}`,
      );
      throw new HttpException(
        'Service d\'authentification temporairement indisponible. Veuillez réessayer.',
        503,
      );
    }
  }
}