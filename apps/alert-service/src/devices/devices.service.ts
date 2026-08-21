import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { DeviceToken } from '../database/entities/device-token.entity';
import { RegisterDeviceDto } from './dto/register-device.dto';

/**
 * Registre des tokens FCM par utilisateur. Un token appartient à un seul
 * utilisateur (contrainte UNIQUE en base) ; la ré-enregistrement met à jour
 * `last_seen_at` et réactive un token précédemment révoqué.
 */
@Injectable()
export class DevicesService {
  private readonly logger = new Logger(DevicesService.name);

  constructor(
    @InjectRepository(DeviceToken)
    private tokensRepository: Repository<DeviceToken>,
  ) {}

  async register(userId: string, dto: RegisterDeviceDto): Promise<DeviceToken> {
    const existing = await this.tokensRepository.findOne({
      where: { token: dto.token },
    });

    if (existing && existing.userId !== userId) {
      // Un token FCM appartient à un seul device, donc un seul compte : on
      // refuse plutôt que de détourner silencieusement les push de l'autre.
      throw new ConflictException(
        'Ce token est déjà enregistré pour un autre utilisateur.',
      );
    }

    if (existing) {
      existing.platform = dto.platform;
      existing.lastSeenAt = new Date();
      existing.revokedAt = null; // réactivation (réinstallation de l'app)
      const saved = await this.tokensRepository.save(existing);
      this.logger.log(`Token FCM ré-enregistré — user=${userId}`);
      return saved;
    }

    const device = this.tokensRepository.create({
      userId,
      token: dto.token,
      platform: dto.platform,
    });
    const saved = await this.tokensRepository.save(device);
    this.logger.log(`Token FCM enregistré — user=${userId} platform=${dto.platform}`);
    return saved;
  }

  async revoke(userId: string, token: string): Promise<void> {
    const existing = await this.tokensRepository.findOne({ where: { token } });
    if (!existing || existing.userId !== userId) {
      // 404 sans distinction pour ne pas divulguer l'existence du token.
      throw new HttpException('Token introuvable.', HttpStatus.NOT_FOUND);
    }

    existing.revokedAt = new Date();
    await this.tokensRepository.save(existing);
    this.logger.log(`Token FCM révoqué — user=${userId}`);
  }

  /** Révocation interne (token jugé mort par FCM) — sans contrôle d'ownership. */
  async revokeInternal(token: string): Promise<void> {
    await this.tokensRepository.update({ token }, { revokedAt: new Date() });
  }

  /** Tokens actifs d'un utilisateur, consommés par le canal FCM. */
  async getActiveTokens(userId: string): Promise<string[]> {
    const devices = await this.tokensRepository.find({
      where: { userId, revokedAt: IsNull() },
      select: ['token'],
    });
    return devices.map((d) => d.token);
  }
}
