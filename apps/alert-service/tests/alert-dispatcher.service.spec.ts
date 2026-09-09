import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';

import { AlertDispatcher } from '../src/alerts/alert-dispatcher.service';
import { Alert } from '../src/database/entities/alert.entity';
import { DispatchAlertDto } from '../src/alerts/dto/dispatch-alert.dto';
import { FcmChannel } from '../src/channels/fcm.channel';
import { AlertsOutboundPublisher } from '../src/channels/alerts-outbound.publisher';
import { MetricsService } from '../src/metrics/metrics.service';

describe('AlertDispatcher', () => {
  let service: AlertDispatcher;
  let alertsRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let config: { get: jest.Mock };
  let metrics: { recordAlertCreated: jest.Mock; recordDedupSkipped: jest.Mock };
  let fcmChannel: { notify: jest.Mock };
  let outboundPublisher: { publish: jest.Mock };

  const makeDto = (overrides: Partial<DispatchAlertDto> = {}): DispatchAlertDto => {
    const dto = new DispatchAlertDto();
    dto.alertType = 'sensor_offline';
    dto.userId = 'user-1';
    dto.parcelId = 'parcel-1';
    dto.severity = 'warning';
    dto.message = 'Le capteur esp32-001 est hors ligne.';
    dto.data = { deviceId: 'esp32-001' };
    Object.assign(dto, overrides);
    return dto;
  };

  const savedAlert = { id: 'alert-1', ...{} } as unknown as Alert;

  beforeEach(async () => {
    alertsRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((v) => v),
      save: jest.fn().mockResolvedValue(savedAlert),
    };
    config = { get: jest.fn().mockReturnValue(24) };
    metrics = { recordAlertCreated: jest.fn(), recordDedupSkipped: jest.fn() };
    fcmChannel = { notify: jest.fn().mockResolvedValue('disabled') };
    outboundPublisher = { publish: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlertDispatcher,
        { provide: getRepositoryToken(Alert), useValue: alertsRepo },
        { provide: ConfigService, useValue: config },
        { provide: MetricsService, useValue: metrics },
        { provide: FcmChannel, useValue: fcmChannel },
        { provide: AlertsOutboundPublisher, useValue: outboundPublisher },
      ],
    }).compile();

    service = module.get<AlertDispatcher>(AlertDispatcher);
  });

  it('✅ Devrait persister l\'alerte et déclencher la distribution', async () => {
    const result = await service.dispatch(makeDto());

    expect(result).toBe(savedAlert);
    expect(alertsRepo.findOne).toHaveBeenCalledTimes(1);
    expect(alertsRepo.save).toHaveBeenCalled();
    expect(metrics.recordAlertCreated).toHaveBeenCalledWith('sensor_offline');

    // Distribution fire-and-forget : laisser la microtask se dérouler.
    await new Promise((resolve) => setImmediate(resolve));
    expect(fcmChannel.notify).toHaveBeenCalledWith(savedAlert);
    expect(outboundPublisher.publish).toHaveBeenCalledWith(savedAlert, { fcm: 'disabled' });
  });

  it('✅ Devrait générer un titre par défaut et une sévérité info si absents', async () => {
    const dto = makeDto({ severity: undefined, title: undefined });
    await service.dispatch(dto);

    const created = alertsRepo.create.mock.calls[0][0] as Partial<Alert>;
    expect(created.title).toBe('Capteur hors ligne');
    expect(created.severity).toBe('info');
  });

  it('❌ Devrait lever 409 (dédup) si une alerte identique existe dans la fenêtre', async () => {
    alertsRepo.findOne.mockResolvedValueOnce({ id: 'existing-alert' });

    await expect(service.dispatch(makeDto())).rejects.toThrow(ConflictException);
    expect(alertsRepo.save).not.toHaveBeenCalled();
    expect(metrics.recordDedupSkipped).toHaveBeenCalledWith('sensor_offline');
    expect(metrics.recordAlertCreated).not.toHaveBeenCalled();
  });

  it('✅ Devrait traiter deux sévérités distinctes comme des alertes différentes (info 2 h vs critical 24 h)', async () => {
    // Un doublon info existe déjà ; l'alerte critical du même capteur doit
    // passer — la sévérité fait partie de la clé de dédup.
    alertsRepo.findOne.mockImplementationOnce(async (options: { where: { severity: string } }) =>
      options.where.severity === 'info' ? { id: 'existing-info' } : null,
    );

    await expect(service.dispatch(makeDto({ severity: 'critical' }))).resolves.toBe(savedAlert);

    const where = alertsRepo.findOne.mock.calls[0][0].where;
    expect(where.severity).toBe('critical');
    expect(metrics.recordAlertCreated).toHaveBeenCalled();
  });

  it('❌ Devrait créer l\'alerte même si toute la distribution échoue (best-effort)', async () => {
    fcmChannel.notify.mockRejectedValueOnce(new Error('FCM down'));
    outboundPublisher.publish.mockRejectedValueOnce(new Error('Kafka down'));

    const result = await service.dispatch(makeDto());
    expect(result).toBe(savedAlert);

    // La promesse de distribution en arrière-plan ne doit jamais rejeter.
    await new Promise((resolve) => setImmediate(resolve));
    expect(metrics.recordAlertCreated).toHaveBeenCalled();
  });

  it('✅ Devrait traiter une alerte sans parcelle (NULL en base, pas de dédup faussée)', async () => {
    await service.dispatch(makeDto({ parcelId: undefined }));

    const where = alertsRepo.findOne.mock.calls[0][0].where;
    expect(where.parcelId).toBeDefined(); // IsNull()
    const created = alertsRepo.create.mock.calls[0][0] as Partial<Alert>;
    expect(created.parcelId).toBeNull();
  });
});
