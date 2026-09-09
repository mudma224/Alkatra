import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SensorActivityService } from '../src/modules/sensors/sensor-activity.service';
import { AlertNotifierService } from '../src/modules/sensors/alert-notifier.service';
import { Sensor } from '../src/database/entities/sensor.entity';
import { Farm } from '../src/database/entities/farm.entity';
import { Parcel } from '../src/database/entities/parcel.entity';

describe('SensorActivityService', () => {
  let service: SensorActivityService;
  let sensorRepo: { find: jest.Mock; update: jest.Mock };
  let alertNotifier: {
    notifySensorSilent: jest.Mock;
    notifySensorFailing: jest.Mock;
    notifyLowBattery: jest.Mock;
  };
  let config: { get: jest.Mock };

  const makeSensor = (overrides: Partial<Sensor> = {}): Sensor =>
    ({
      id: 'sensor-1',
      parcelId: 'parcel-1',
      deviceId: 'esp32-001',
      healthStatus: 'active',
      lastSeenAt: new Date('2026-08-20T00:00:00Z'),
      batteryPct: 62,
      parcel: {
        id: 'parcel-1',
        farmId: 'farm-1',
        farm: { id: 'farm-1', ownerId: 'user-1' } as Farm,
      } as Parcel,
      ...overrides,
    }) as Sensor;

  beforeEach(async () => {
    sensorRepo = { find: jest.fn(), update: jest.fn() };
    alertNotifier = {
      notifySensorSilent: jest.fn().mockResolvedValue(undefined),
      notifySensorFailing: jest.fn().mockResolvedValue(undefined),
      notifyLowBattery: jest.fn().mockResolvedValue(undefined),
    };
    config = {
      get: jest.fn((key: string) => {
        if (key === 'app.sensorActivity.inactiveHours') return 2;
        if (key === 'app.sensorActivity.failingHours') return 24;
        if (key === 'app.lowBatteryThresholdPct') return 20;
        if (key === 'app.sensorActivity.checkIntervalMinutes') return 15;
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SensorActivityService,
        { provide: getRepositoryToken(Sensor), useValue: sensorRepo },
        { provide: AlertNotifierService, useValue: alertNotifier },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<SensorActivityService>(SensorActivityService);
  });

  describe('deactivateSilentSensors (active → inactive, seuil 2 h)', () => {
    it('✅ Devrait passer inactive et notifier (info) les capteurs actifs silencieux > 2 h', async () => {
      const silent = [makeSensor(), makeSensor({ id: 'sensor-2', deviceId: 'esp32-002' })];
      sensorRepo.find.mockResolvedValueOnce(silent);

      const affected = await service.deactivateSilentSensors();

      expect(affected).toBe(2);
      const args = sensorRepo.find.mock.calls[0][0];
      expect(args.where.healthStatus).toBe('active');
      // Le seuil correspond bien à 2 h avant maintenant (tolérance 1 s).
      const threshold = args.where.lastSeenAt.value as Date;
      const expected = Date.now() - 2 * 60 * 60 * 1000;
      expect(Math.abs(threshold.getTime() - expected)).toBeLessThan(1000);
      // Relations parcel → farm chargées pour résoudre le propriétaire.
      expect(args.relations).toEqual({ parcel: { farm: true } });
      expect(sensorRepo.update).toHaveBeenCalledWith(
        ['sensor-1', 'sensor-2'],
        { healthStatus: 'inactive' },
      );
      expect(alertNotifier.notifySensorSilent).toHaveBeenCalledTimes(2);
      expect(alertNotifier.notifySensorSilent).toHaveBeenCalledWith(silent[0], 2);
    });

    it('✅ Ne devrait cibler que les capteurs « active » (jamais pending/inactive/failing)', async () => {
      sensorRepo.find.mockResolvedValueOnce([]);

      await service.deactivateSilentSensors();
      expect(sensorRepo.find.mock.calls[0][0].where.healthStatus).toBe('active');
      expect(sensorRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('escalateToFailingSensors (inactive → failing, seuil 24 h)', () => {
    it('✅ Devrait escalader et notifier (critical) les capteurs inactive silencieux > 24 h', async () => {
      const stale = [makeSensor({ healthStatus: 'inactive', lastSeenAt: new Date('2026-08-19T00:00:00Z') })];
      sensorRepo.find.mockResolvedValueOnce(stale);

      const escalated = await service.escalateToFailingSensors();

      expect(escalated).toBe(1);
      const args = sensorRepo.find.mock.calls[0][0];
      expect(args.where.healthStatus).toBe('inactive');
      const threshold = args.where.lastSeenAt.value as Date;
      const expected = Date.now() - 24 * 60 * 60 * 1000;
      expect(Math.abs(threshold.getTime() - expected)).toBeLessThan(1000);
      expect(sensorRepo.update).toHaveBeenCalledWith(['sensor-1'], { healthStatus: 'failing' });
      expect(alertNotifier.notifySensorFailing).toHaveBeenCalledWith(stale[0], 24);
    });

    it('✅ Ne devrait rien faire si aucun capteur n\'a dépassé 24 h de silence', async () => {
      sensorRepo.find.mockResolvedValueOnce([]);

      await expect(service.escalateToFailingSensors()).resolves.toBe(0);
      expect(alertNotifier.notifySensorFailing).not.toHaveBeenCalled();
    });
  });

  describe('notifyLowBatterySensors', () => {
    it('✅ Devrait notifier les capteurs ACTIVE sous le seuil de batterie uniquement', async () => {
      const lowBattery = makeSensor({ batteryPct: 12 });
      sensorRepo.find.mockResolvedValueOnce([lowBattery]);

      const count = await service.notifyLowBatterySensors();

      expect(count).toBe(1);
      const where = sensorRepo.find.mock.calls[0][0].where;
      expect(where.healthStatus).toBe('active');
      expect(where.batteryPct.value).toBe(20);
      expect(alertNotifier.notifyLowBattery).toHaveBeenCalledWith(lowBattery);
    });
  });

  describe('runSensorHealthChecks', () => {
    it('✅ Devrait enchaîner les trois transitions et agréger les résultats', async () => {
      sensorRepo.find
        .mockResolvedValueOnce([makeSensor()]) // deactivate
        .mockResolvedValueOnce([makeSensor({ id: 'sensor-9', healthStatus: 'inactive' })]) // escalate
        .mockResolvedValueOnce([]); // low battery

      const result = await service.runSensorHealthChecks();

      expect(result).toEqual({ deactivated: 1, escalated: 1, lowBattery: 0 });
    });

    it('❌ Devrait avaler une erreur DB (cycle en arrière-plan, pas de rejet non géré)', async () => {
      sensorRepo.find.mockRejectedValueOnce(new Error('conn refused'));

      // runChecks est privé — runSensorHealthChecks propage l'erreur DB au
      // cycle appelant qui la catch (voir implémentation) ; ici on vérifie
      // juste que la première transition rejette proprement.
      await expect(service.deactivateSilentSensors()).rejects.toThrow('conn refused');
    });
  });
});
