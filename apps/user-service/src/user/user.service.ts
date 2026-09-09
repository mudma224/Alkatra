import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserMetricsService } from '../metrics/user-metrics.service';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);
  private readonly authServiceUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly metrics: UserMetricsService,
  ) {
    const authHost = this.configService.get<string>('AUTH_SERVICE_HOST') ?? 'localhost';
    const authPort = this.configService.get<string>('AUTH_SERVICE_PORT') ?? '3001';
    this.authServiceUrl = `http://${authHost}:${authPort}/internal/user`;
  }

  async getProfile(userId: string) {
    this.metrics.recordProfileRequest();
    try {
      const response = await axios.get(`${this.authServiceUrl}/${userId}`);
      this.metrics.recordAuthCall('get_profile', 'ok');
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 404) {
        this.metrics.recordAuthCall('get_profile', 'not_found');
        throw new NotFoundException('Utilisateur introuvable');
      }
      this.metrics.recordAuthCall('get_profile', 'error');
      this.logger.error(
        `Erreur lors de l'appel à auth-service pour getProfile(${userId}): ${axiosError.message}`,
      );
      throw error;
    }
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    this.metrics.recordProfileUpdate();
    try {
      const response = await axios.patch(`${this.authServiceUrl}/${userId}`, dto);
      this.metrics.recordAuthCall('update_profile', 'ok');
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 404) {
        this.metrics.recordAuthCall('update_profile', 'not_found');
        throw new NotFoundException('Utilisateur introuvable');
      }
      this.metrics.recordAuthCall('update_profile', 'error');
      this.logger.error(
        `Erreur lors de l'appel à auth-service pour updateProfile(${userId}): ${axiosError.message}`,
      );
      throw error;
    }
  }
}