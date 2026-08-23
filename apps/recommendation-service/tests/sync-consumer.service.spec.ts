import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SyncConsumerService } from '../src/sync/sync-consumer.service';
import { DoubleWriteService } from '../src/sync/double-write.service';
import { MetricsService } from '../src/metrics/metrics.service';

/**
 * Tests du SyncConsumerService.
 *
 * On évite de monter une vraie connexion Kafka : on instancie le service sans
 * appeler onModuleInit(), et on appelle directement handleMessage() (privé) via
 * un cast pour valider la logique de validation / DLQ / métriques.
 */
describe('SyncConsumerService', () => {
  let service: SyncConsumerService;
  let doubleWrite: jest.Mocked<DoubleWriteService>;
  let metrics: jest.Mocked<MetricsService>;

  const validPayload = {
    parcel_id: '11111111-1111-4111-8111-111111111111',
    should_irrigate: true,
    irrigation_probability: 0.8,
    water_amount_mm: 5.0,
    top_factors: [],
    model_version: '1.0.0',
    demo_mode: false,
  };

  beforeEach(async () => {
    doubleWrite = { persist: jest.fn().mockResolvedValue({}) } as unknown as jest.Mocked<DoubleWriteService>;
    metrics = {
      recordKafkaMessage: jest.fn(),
      recordRecommendationPersisted: jest.fn(),
      recordPersistenceError: jest.fn(),
      recordHttpRequest: jest.fn(),
      recordHttpDuration: jest.fn(),
      setKafkaConsumerConnected: jest.fn(),
      format: jest.fn().mockReturnValue(''),
    } as unknown as jest.Mocked<MetricsService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncConsumerService,
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: DoubleWriteService, useValue: doubleWrite },
        { provide: MetricsService, useValue: metrics },
      ],
    }).compile();

    service = module.get(SyncConsumerService);
  });

  /** Accès à la méthode privée pour les tests. */
  const handleMessage = (raw: string) =>
    (service as unknown as { handleMessage: (r: string, t: string) => Promise<void> }).handleMessage(
      raw,
      'recommendations-generated-dlq',
    );

  it('persiste un message valide et enregistre la métrique ok', async () => {
    // Le service n’ayant pas de DLQ producer connecté, sendToDlq est un no-op.
    await handleMessage(JSON.stringify(validPayload));

    expect(doubleWrite.persist).toHaveBeenCalledTimes(1);
    expect(metrics.recordKafkaMessage).toHaveBeenCalledWith('ok');
  });

  it('rejette un message non-JSON (métrique invalid)', async () => {
    await handleMessage('not-json');

    expect(doubleWrite.persist).not.toHaveBeenCalled();
    expect(metrics.recordKafkaMessage).toHaveBeenCalledWith('invalid');
  });

  it('rejette un message invalide (champ manquant → métrique invalid)', async () => {
    const invalid = { ...validPayload, parcel_id: 'not-a-uuid' };
    await handleMessage(JSON.stringify(invalid));

    expect(doubleWrite.persist).not.toHaveBeenCalled();
    expect(metrics.recordKafkaMessage).toHaveBeenCalledWith('invalid');
  });

  it('enregistre une erreur de persistance (métrique error + persistenceError)', async () => {
    doubleWrite.persist.mockRejectedValue(new Error('DB down'));

    await handleMessage(JSON.stringify(validPayload));

    expect(metrics.recordKafkaMessage).toHaveBeenCalledWith('error');
    expect(metrics.recordPersistenceError).toHaveBeenCalled();
  });

  it('isConnected() retourne false avant init', () => {
    expect(service.isConnected()).toBe(false);
  });
});
