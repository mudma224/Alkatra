import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PredictionEventDto } from '../src/dto/prediction-event.dto';
import { Recommendation } from '../src/entities/recommendation.entity';
import { ExplanationService } from '../src/explanation/explanation.service';
import { DoubleWriteService } from '../src/sync/double-write.service';

describe('DoubleWriteService', () => {
  let service: DoubleWriteService;
  let repo: jest.Mocked<Repository<Recommendation>>;

  const event: PredictionEventDto = {
    parcel_id: '11111111-1111-4111-8111-111111111111',
    should_irrigate: true,
    irrigation_probability: 0.87654,
    water_amount_mm: 12.5,
    water_amount_raw_mm: 11.8,
    bias_applied_mm: 0.7,
    top_factors: [
      { feature: 'humidite_sol_avant_%', label_fr: 'Humidité sol actuelle', label_ar: 'رطوبة التربة الحالية', contribution: -3.21 },
    ],
    model_version: '1.0.0',
    demo_mode: false,
    generated_at: '2026-08-01T06:00:00.000Z',
    duration_minutes: 45,
    soil_humidity_pct: 22.5,
    eto: 5.2,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DoubleWriteService,
        ExplanationService,
        {
          provide: getRepositoryToken(Recommendation),
          useValue: {
            create: jest.fn((x) => x),
            save: jest.fn((x) => Promise.resolve({ ...x, id: 'uuid-generated' })),
            findOne: jest.fn().mockResolvedValue(null),
          },
        },
      ],
    }).compile();

    service = module.get(DoubleWriteService);
    repo = module.get(getRepositoryToken(Recommendation));
  });

  it('mappe correctement l\'événement Kafka vers l\'entité PostgreSQL', async () => {
    const saved = await service.persist(event);

    expect(repo.create).toHaveBeenCalled();
    expect(saved!.parcelId).toBe(event.parcel_id);
    expect(saved!.irrigate).toBe(true);
    expect(saved!.confidenceScore).toBe(0.877);
    expect(saved!.quantityMm).toBe(12.5);
    expect(saved!.modelVersion).toBe('1.0.0');
    expect(saved!.status).toBe('pending');
  });

  it('persiste les shap_factors en JSONB', async () => {
    const saved = await service.persist(event);
    expect(saved!.shapFactors).toHaveLength(1);
    expect(saved!.shapFactors![0].feature).toBe('humidite_sol_avant_%');
  });

  it('remplit les explications FR et Darija', async () => {
    const saved = await service.persist(event);
    expect(saved!.explanationTextFr).toBeTruthy();
    expect(saved!.explanationTextDarija).toBeTruthy();
    expect(saved!.reasonCode).toBe('LOW_SOIL_MOISTURE');
  });

  it('force quantity_mm à 0 quand should_irrigate = false', async () => {
    const saved = await service.persist({
      ...event,
      should_irrigate: false,
      water_amount_mm: 0,
    });

    expect(saved!.irrigate).toBe(false);
    expect(saved!.quantityMm).toBe(0);
  });

  it('alimente les champs duration_minutes, soil_humidity_pct et eto depuis le payload', async () => {
    const saved = await service.persist(event);
    expect(saved!.durationMinutes).toBe(45);
    expect(saved!.soilHumidityPctAtGen).toBe(22.5);
    expect(saved!.etoAtGen).toBe(5.2);
  });

  it('stocke demo_mode depuis le payload', async () => {
    const saved = await service.persist({ ...event, demo_mode: true });
    expect(saved!.demoMode).toBe(true);
  });

  it('utilise NOW() si generated_at est absent', async () => {
    const { generated_at, ...withoutDate } = event;
    const saved = await service.persist(withoutDate as PredictionEventDto);
    expect(saved!.generatedAt).toBeInstanceOf(Date);
  });

  it('ignore les doublons (idempotence)', async () => {
    repo.findOne.mockResolvedValueOnce({ id: 'existing-id' } as Recommendation);
    const result = await service.persist(event);
    expect(result).toBeNull();
    expect(repo.save).not.toHaveBeenCalled();
  });
});