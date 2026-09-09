import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as request from 'supertest';
import { Recommendation } from '../../src/entities/recommendation.entity';
import { AllExceptionsFilter } from '../../src/common/filters/http-exception.filter';
import { RecommendationsModule } from '../../src/recommendations/recommendations.module';
import { FarmClientService } from '../../src/recommendations/farm-client.service';
import { MetricsModule } from '../../src/metrics/metrics.module';
import { ObservabilityModule } from '@alkatra/observability';
import { SyncConsumerService } from '../../src/sync/sync-consumer.service';

/**
 * Test E2E : monte l'app réelle (guards, pipes, filters, controller) en
 * remplaçant uniquement les dépendances externes (DB, Kafka, farm-service HTTP).
 *
 * Le guard JWT reste réel : on signe un vrai token avec le même secret que la
 * JwtStrategy afin de valider la chaîne d'authentification de bout en bout.
 */
describe('Recommendations E2E', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let farmClient: jest.Mocked<FarmClientService>;
  let repo: Record<string, jest.Mock>;
  let token: string;

  const parcelId = '11111111-1111-4111-8111-111111111111';
  const recoId = '22222222-2222-2222-2222-222222222222';
  const userId = 'user-e2e-1';

  beforeAll(async () => {
    // Stub du repository TypeORM.
    repo = {
      findOne: jest.fn(),
      findAndCount: jest.fn(),
      save: jest.fn((x) => Promise.resolve(x)),
      create: jest.fn((x) => x),
      createQueryBuilder: jest.fn().mockReturnValue({
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected: 1 }),
      }),
    };

    farmClient = {
      assertParcelOwnership: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<FarmClientService>;

    const dataSourceStub = { query: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          load: [
            () => ({
              app: {
                env: 'test',
                port: 3004,
                corsOrigins: ['*'],
                database: { url: 'stub', synchronize: false, logging: false },
                jwt: { secret: 'e2e-test-secret-32-chars-min!!' },
                kafka: { consumerEnabled: false },
                farmService: { url: 'http://stub', timeoutMs: 5000 },
              },
            }),
          ],
        }),
        ObservabilityModule.forRoot({ prefix: 'recommendation' }),
        MetricsModule,
        RecommendationsModule,
      ],
    })
      .overrideProvider(getRepositoryToken(Recommendation))
      .useValue(repo)
      .overrideProvider(FarmClientService)
      .useValue(farmClient)
      .overrideProvider(DataSource)
      .useValue(dataSourceStub)
      .overrideProvider(SyncConsumerService)
      .useValue({ isConnected: () => false })
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();

    jwtService = app.get(JwtService);
    token = jwtService.sign({ sub: userId, phone: '+212600000000' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejecte un appel sans token (401)', async () => {
    await request(app.getHttpServer())
      .get(`/api/v1/recommendations/parcel/${parcelId}/today`)
      .expect(401);
  });

  it('GET /today retourne la recommandation du jour', async () => {
    repo.findOne.mockResolvedValueOnce({
      id: recoId,
      parcelId,
      generatedAt: new Date(),
      irrigate: true,
      confidenceScore: 0.9,
      quantityMm: 5.0,
      durationMinutes: null,
      reasonCode: 'LOW_SOIL_MOISTURE',
      shapFactors: [],
      explanationTextFr: 'fr',
      explanationTextDarija: 'darija',
      modelVersion: '1.0.0',
      status: 'seen',
      userFeedback: null,
      demoMode: false,
    });

    const res = await request(app.getHttpServer())
      .get(`/api/v1/recommendations/parcel/${parcelId}/today`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(farmClient.assertParcelOwnership).toHaveBeenCalled();
    expect(res.body.id).toBe(recoId);
    expect(res.body.irrigate).toBe(true);
  });

  it('PATCH /feedback applique un feedback accepté', async () => {
    repo.findOne.mockResolvedValueOnce({ id: recoId, parcelId, status: 'pending' });
    repo.findOne.mockResolvedValueOnce({ id: recoId, parcelId, status: 'pending' });
    repo.findOne.mockResolvedValueOnce({ id: recoId, parcelId, status: 'pending' });

    const res = await request(app.getHttpServer())
      .patch(`/api/v1/recommendations/${recoId}/feedback`)
      .set('Authorization', `Bearer ${token}`)
      .send({ feedback: 'accepted' })
      .expect(200);

    expect(res.body.status).toBe('accepted');
  });

  it('PATCH /feedback rejette une valeur de feedback invalide (400)', async () => {
    repo.findOne.mockResolvedValue({ id: recoId, parcelId, status: 'pending' });

    await request(app.getHttpServer())
      .patch(`/api/v1/recommendations/${recoId}/feedback`)
      .set('Authorization', `Bearer ${token}`)
      .send({ feedback: 'invalid-value' })
      .expect(400);
  });

  it('expose /metrics au format texte Prometheus', async () => {
    const res = await request(app.getHttpServer())
      .get('/metrics')
      .expect(200);

    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('recommendation_');
  });
});
