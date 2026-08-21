import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { RecommendationsConsumer } from '../src/consumers/recommendations.consumer';
import { AlertDispatcher } from '../src/alerts/alert-dispatcher.service';
import { FarmClientService } from '../src/alerts/farm-client.service';
import { MetricsService } from '../src/metrics/metrics.service';

describe('RecommendationsConsumer', () => {
  let service: RecommendationsConsumer;
  let config: { get: jest.Mock };
  let dispatcher: { dispatch: jest.Mock };
  let farmClient: { getParcelOwner: jest.Mock };
  let metrics: {
    recordKafkaMessage: jest.Mock;
    recordPersistenceError: jest.Mock;
    recordDlqSent: jest.Mock;
    setKafkaConsumerConnected: jest.Mock;
  };

  const handleMessage = (raw: string) =>
    (service as unknown as {
      handleMessage: (raw: string, dlqTopic: string) => Promise<void>;
    }).handleMessage(raw, 'alerts-dlq');

  beforeEach(async () => {
    config = {
      get: jest.fn((key: string) => {
        if (key === 'app.hydricStress.probabilityThreshold') return 0.75;
        if (key === 'app.hydricStress.soilHumidityMaxPct') return 25;
        return undefined;
      }),
    };
    dispatcher = { dispatch: jest.fn().mockResolvedValue({ id: 'alert-1' }) };
    farmClient = {
      getParcelOwner: jest
        .fn()
        .mockResolvedValue({ parcelId: 'p1', farmId: 'f1', ownerId: 'user-1' }),
    };
    metrics = {
      recordKafkaMessage: jest.fn(),
      recordPersistenceError: jest.fn(),
      recordDlqSent: jest.fn(),
      setKafkaConsumerConnected: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecommendationsConsumer,
        { provide: ConfigService, useValue: config },
        { provide: AlertDispatcher, useValue: dispatcher },
        { provide: FarmClientService, useValue: farmClient },
        { provide: MetricsService, useValue: metrics },
      ],
    }).compile();

    service = module.get<RecommendationsConsumer>(RecommendationsConsumer);
  });

  it('✅ isConnected() devrait être false avant initialisation', () => {
    expect(service.isConnected()).toBe(false);
  });

  it('✅ Devrait ignorer un message non-JSON (métrique invalid)', async () => {
    await handleMessage('not-json{');
    expect(metrics.recordKafkaMessage).toHaveBeenCalledWith('invalid');
    // DLQ non connectée en test → no-op, pas d'erreur.
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('✅ Devrait ignorer un message invalide (parcel_id non-UUID)', async () => {
    await handleMessage(
      JSON.stringify({
        parcel_id: 'not-an-uuid',
        should_irrigate: true,
        irrigation_probability: 0.9,
        soil_humidity_pct: 10,
      }),
    );
    expect(metrics.recordKafkaMessage).toHaveBeenCalledWith('invalid');
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('✅ Devrait traiter sans alerter une recommandation non critique', async () => {
    await handleMessage(
      JSON.stringify({
        parcel_id: '550e8400-e29b-41d4-a716-446655440000',
        should_irrigate: true,
        irrigation_probability: 0.5,
        soil_humidity_pct: 40,
      }),
    );
    expect(metrics.recordKafkaMessage).toHaveBeenCalledWith('ok');
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('✅ Devrait créer une alerte hydrique critique pour un message critique', async () => {
    await handleMessage(
      JSON.stringify({
        parcel_id: '550e8400-e29b-41d4-a716-446655440000',
        should_irrigate: true,
        irrigation_probability: 0.9,
        soil_humidity_pct: 12,
      }),
    );

    expect(farmClient.getParcelOwner).toHaveBeenCalledWith(
      '550e8400-e29b-41d4-a716-446655440000',
    );
    expect(dispatcher.dispatch).toHaveBeenCalledTimes(1);
    const dto = dispatcher.dispatch.mock.calls[0][0];
    expect(dto.alertType).toBe('hydric_stress_critical');
    expect(dto.userId).toBe('user-1');
    expect(dto.severity).toBe('critical');
    expect(metrics.recordKafkaMessage).toHaveBeenCalledWith('ok');
  });

  it('✅ Devrait skipper sans DLQ si la parcelle est inconnue de farm-service', async () => {
    farmClient.getParcelOwner.mockResolvedValueOnce(null);

    await handleMessage(
      JSON.stringify({
        parcel_id: '550e8400-e29b-41d4-a716-446655440000',
        should_irrigate: true,
        irrigation_probability: 0.9,
        soil_humidity_pct: 12,
      }),
    );

    expect(metrics.recordKafkaMessage).toHaveBeenCalledWith('skipped_no_owner');
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('❌ Devrait compter une erreur si farm-service est injoignable', async () => {
    farmClient.getParcelOwner.mockRejectedValueOnce(new Error('circuit ouvert'));

    await handleMessage(
      JSON.stringify({
        parcel_id: '550e8400-e29b-41d4-a716-446655440000',
        should_irrigate: true,
        irrigation_probability: 0.9,
        soil_humidity_pct: 12,
      }),
    );

    expect(metrics.recordKafkaMessage).toHaveBeenCalledWith('error');
    expect(dispatcher.dispatch).not.toHaveBeenCalled();
  });

  it('✅ Devrait tolérer un 409 de dédup comme un succès fonctionnel', async () => {
    dispatcher.dispatch.mockRejectedValueOnce(new ConflictException('doublon'));

    await handleMessage(
      JSON.stringify({
        parcel_id: '550e8400-e29b-41d4-a716-446655440000',
        should_irrigate: true,
        irrigation_probability: 0.9,
        soil_humidity_pct: 12,
      }),
    );

    expect(metrics.recordKafkaMessage).toHaveBeenCalledWith('ok');
    expect(metrics.recordPersistenceError).not.toHaveBeenCalled();
  });

  it('❌ Devrait compter une erreur de persistance si le dispatch échoue', async () => {
    dispatcher.dispatch.mockRejectedValueOnce(new Error('DB down'));

    await handleMessage(
      JSON.stringify({
        parcel_id: '550e8400-e29b-41d4-a716-446655440000',
        should_irrigate: true,
        irrigation_probability: 0.9,
        soil_humidity_pct: 12,
      }),
    );

    expect(metrics.recordKafkaMessage).toHaveBeenCalledWith('error');
    expect(metrics.recordPersistenceError).toHaveBeenCalled();
  });
});
