import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { AlertNotifierService } from '../src/modules/sensors/alert-notifier.service';
import { Sensor } from '../src/database/entities/sensor.entity';
import { Parcel } from '../src/database/entities/parcel.entity';
import { Farm } from '../src/database/entities/farm.entity';

describe('AlertNotifierService', () => {
  let service: AlertNotifierService;
  let config: { get: jest.Mock };
  let fetchMock: jest.Mock;

  const makeSensor = (): Sensor =>
    ({
      id: 'sensor-1',
      parcelId: 'parcel-1',
      deviceId: 'esp32-001',
      lastSeenAt: new Date('2026-08-19T00:00:00Z'),
      batteryPct: 62,
      parcel: {
        id: 'parcel-1',
        farm: { id: 'farm-1', ownerId: 'user-1' } as Farm,
      } as Parcel,
    }) as Sensor;

  beforeEach(async () => {
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 201 });
    global.fetch = fetchMock as unknown as typeof fetch;

    config = {
      get: jest.fn((key: string) => {
        if (key === 'app.alertServiceUrl') return 'http://alert-service:3006';
        if (key === 'app.internalToken') return 'secret-internal';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertNotifierService,
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<AlertNotifierService>(AlertNotifierService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('✅ Devrait poster une alerte info (capteur silencieux) avec owner résolu et X-Internal-Token', async () => {
    await service.notifySensorSilent(makeSensor(), 2);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://alert-service:3006/internal/alerts',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-Internal-Token': 'secret-internal' }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual(
      expect.objectContaining({
        alertType: 'sensor_offline',
        userId: 'user-1',
        parcelId: 'parcel-1',
        severity: 'info',
        title: 'Capteur silencieux',
        data: expect.objectContaining({ deviceId: 'esp32-001', silentHours: 2 }),
      }),
    );
  });

  it('✅ Devrait poster une alerte critical (capteur défaillant) après 24 h de silence', async () => {
    await service.notifySensorFailing(makeSensor(), 24);

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.alertType).toBe('sensor_offline');
    expect(body.severity).toBe('critical');
    expect(body.title).toBe('Capteur défaillant');
    expect(body.data.silentHours).toBe(24);
  });

  it('✅ Devrait poster une alerte low_battery avec le niveau de batterie', async () => {
    await service.notifyLowBattery(makeSensor());

    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.alertType).toBe('low_battery');
    expect(body.title).toBe('Batterie capteur faible');
    expect(body.data.batteryPct).toBe(62);
  });

  it('✅ Devrait tolérer un 409 (dédup alert-service) sans warning bloquant', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409 });
    await expect(service.notifySensorSilent(makeSensor(), 2)).resolves.toBeUndefined();
  });

  it('✅ Devrait avaler une erreur réseau (best-effort, jamais de rejet)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(service.notifySensorSilent(makeSensor(), 2)).resolves.toBeUndefined();
  });

  it('✅ Devrait skipper si l\'owner est irrésoluble (relation non chargée)', async () => {
    const orphan = makeSensor();
    orphan.parcel = undefined as unknown as Parcel;

    await service.notifySensorSilent(orphan, 2);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
