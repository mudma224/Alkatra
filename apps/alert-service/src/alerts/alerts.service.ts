import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Alert, type AlertStatusValue } from '../database/entities/alert.entity';
import { ListAlertsQueryDto } from './dto/list-alerts.query.dto';

export interface PaginatedAlerts {
  data: Alert[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Lecture et gestion du cycle de vie des alertes pour l'utilisateur connecté.
 * Toute requête est isolée par `userId` issu du JWT.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    @InjectRepository(Alert)
    private alertsRepository: Repository<Alert>,
  ) {}

  async findAll(userId: string, query: ListAlertsQueryDto): Promise<PaginatedAlerts> {
    // unreadOnly est un raccourci de status=unread et prend le pas sur lui.
    const effectiveStatus: AlertStatusValue | undefined = query.unreadOnly
      ? 'unread'
      : query.status;

    const [data, total] = await this.alertsRepository.findAndCount({
      where: { userId, ...(effectiveStatus ? { status: effectiveStatus } : {}) },
      order: { createdAt: 'DESC' },
      take: query.limit,
      skip: query.offset,
    });

    return { data, total, limit: query.limit, offset: query.offset };
  }

  async countUnread(userId: string): Promise<number> {
    return this.alertsRepository.count({
      where: { userId, status: 'unread' },
    });
  }

  async markRead(userId: string, alertId: string): Promise<Alert> {
    const alert = await this.alertsRepository.findOne({ where: { id: alertId } });
    if (!alert) {
      throw new HttpException('Alerte introuvable.', HttpStatus.NOT_FOUND);
    }
    if (alert.userId !== userId) {
      throw new HttpException('Accès refusé à cette alerte.', HttpStatus.FORBIDDEN);
    }

    if (alert.status !== 'unread') {
      // Idempotent : marquer comme lue une alerte déjà lue ne fait rien.
      return alert;
    }

    alert.status = 'read';
    alert.readAt = new Date();
    return this.alertsRepository.save(alert);
  }

  async markAllRead(userId: string): Promise<{ updated: number }> {
    const result = await this.alertsRepository.update(
      { userId, status: 'unread' },
      { status: 'read', readAt: new Date() },
    );

    const updated = result.affected ?? 0;
    if (updated > 0) {
      this.logger.log(`${updated} alerte(s) marquée(s) comme lue(s) — user=${userId}`);
    }
    return { updated };
  }
}
