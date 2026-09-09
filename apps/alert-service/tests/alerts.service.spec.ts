import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { HttpException, HttpStatus } from '@nestjs/common';

import { AlertsService } from '../src/alerts/alerts.service';
import { Alert } from '../src/database/entities/alert.entity';
import { ListAlertsQueryDto } from '../src/alerts/dto/list-alerts.query.dto';

describe('AlertsService', () => {
  let service: AlertsService;
  let alertsRepo: {
    findAndCount: jest.Mock;
    count: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };

  const makeAlert = (overrides: Partial<Alert> = {}): Alert =>
    ({
      id: 'alert-1',
      userId: 'user-1',
      parcelId: 'parcel-1',
      alertType: 'sensor_offline',
      severity: 'warning',
      status: 'unread',
      title: 'Capteur hors ligne',
      message: 'Le capteur est hors ligne.',
      data: {},
      readAt: null,
      createdAt: new Date(),
      ...overrides,
    }) as Alert;

  beforeEach(async () => {
    alertsRepo = {
      findAndCount: jest.fn().mockResolvedValue([[makeAlert()], 1]),
      count: jest.fn().mockResolvedValue(2),
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((a) => a),
      update: jest.fn().mockResolvedValue({ affected: 3 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertsService,
        { provide: getRepositoryToken(Alert), useValue: alertsRepo },
      ],
    }).compile();

    service = module.get<AlertsService>(AlertsService);
  });

  describe('findAll', () => {
    it('✅ Devrait lister les alertes de l\'utilisateur, triées par date décroissante', async () => {
      const query = new ListAlertsQueryDto();
      query.limit = 20;
      query.offset = 0;

      const result = await service.findAll('user-1', query);

      expect(result.total).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
      expect(result.data[0].id).toBe('alert-1');
      const args = alertsRepo.findAndCount.mock.calls[0][0];
      expect(args.where).toEqual({ userId: 'user-1' });
      expect(args.order).toEqual({ createdAt: 'DESC' });
      expect(args.take).toBe(20);
      expect(args.skip).toBe(0);
    });

    it('✅ Devrait filtrer par status=unread via unreadOnly', async () => {
      const query = new ListAlertsQueryDto();
      query.unreadOnly = true;

      await service.findAll('user-1', query);
      const args = alertsRepo.findAndCount.mock.calls[0][0];
      expect(args.where).toEqual({ userId: 'user-1', status: 'unread' });
    });
  });

  describe('countUnread', () => {
    it('✅ Devrait compter uniquement les non-lues de l\'utilisateur', async () => {
      await expect(service.countUnread('user-1')).resolves.toBe(2);
      expect(alertsRepo.count).toHaveBeenCalledWith({
        where: { userId: 'user-1', status: 'unread' },
      });
    });
  });

  describe('markRead', () => {
    it('❌ Devrait retourner 404 si l\'alerte n\'existe pas', async () => {
      alertsRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.markRead('user-1', 'inconnu')).rejects.toThrow(HttpException);
    });

    it('❌ Devrait retourner 403 si l\'alerte appartient à un autre utilisateur', async () => {
      alertsRepo.findOne.mockResolvedValueOnce(makeAlert({ userId: 'user-2' }));
      await expect(service.markRead('user-1', 'alert-1')).rejects.toThrow(
        new HttpException('Accès refusé à cette alerte.', HttpStatus.FORBIDDEN),
      );
    });

    it('✅ Devrait marquer comme lue (status + read_at)', async () => {
      alertsRepo.findOne.mockResolvedValueOnce(makeAlert());
      const result = await service.markRead('user-1', 'alert-1');

      expect(result.status).toBe('read');
      expect(result.readAt).toBeInstanceOf(Date);
    });

    it('✅ Devrait être idempotent pour une alerte déjà lue', async () => {
      alertsRepo.findOne.mockResolvedValueOnce(makeAlert({ status: 'read', readAt: new Date() }));
      const result = await service.markRead('user-1', 'alert-1');
      expect(result.status).toBe('read');
      expect(alertsRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('markAllRead', () => {
    it('✅ Devrait mettre à jour toutes les non-lues et renvoyer le nombre', async () => {
      const result = await service.markAllRead('user-1');
      expect(result).toEqual({ updated: 3 });
      expect(alertsRepo.update).toHaveBeenCalledWith(
        { userId: 'user-1', status: 'unread' },
        expect.objectContaining({ status: 'read' }),
      );
    });
  });
});
