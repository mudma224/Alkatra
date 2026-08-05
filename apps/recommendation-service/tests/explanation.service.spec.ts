import { Test, TestingModule } from '@nestjs/testing';
import { ExplanationService } from '../src/explanation/explanation.service';
import { REASON_CODES } from '../src/explanation/explanation.templates';

describe('ExplanationService', () => {
  let service: ExplanationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ExplanationService],
    }).compile();

    service = module.get<ExplanationService>(ExplanationService);
  });

  it('doit être défini', () => {
    expect(service).toBeDefined();
  });

  it('génère un message d\'irrigation basé sur l\'humidité du sol', () => {
    const result = service.build({
      irrigate: true,
      quantityMm: 12.5,
      confidenceScore: 0.87,
      topFactors: [
        { feature: 'humidite_sol_avant_%', label_fr: 'Humidité sol actuelle', label_ar: '', contribution: -3.2 },
        { feature: 'temp_max', label_fr: 'Température max', label_ar: '', contribution: 1.1 },
      ],
    });

    expect(result.reasonCode).toBe(REASON_CODES.LOW_SOIL_MOISTURE);
    expect(result.fr).toContain('12.5 mm');
    expect(result.darija).toContain('12.5');
    expect(result.fr).not.toContain('{qty}');
  });

  it('génère un message de non-irrigation après une pluie récente', () => {
    const result = service.build({
      irrigate: false,
      quantityMm: 0,
      confidenceScore: 0.92,
      topFactors: [
        { feature: 'pluie_3j', label_fr: 'Cumul pluie 3j', label_ar: '', contribution: 4.8 },
      ],
    });

    expect(result.reasonCode).toBe(REASON_CODES.RECENT_RAIN);
    expect(result.fr).toContain('Pas besoin d\'irriguer');
  });

  it('sélectionne le facteur de plus forte contribution absolue', () => {
    const result = service.build({
      irrigate: true,
      quantityMm: 8,
      confidenceScore: 0.7,
      topFactors: [
        { feature: 'temp_max', label_fr: '', label_ar: '', contribution: 0.5 },
        { feature: 'vent', label_fr: '', label_ar: '', contribution: -5.9 },
      ],
    });

    expect(result.reasonCode).toBe(REASON_CODES.STRONG_WIND);
  });

  it('ajoute le suffixe de confiance faible si score < 0.5', () => {
    const result = service.build({
      irrigate: true,
      quantityMm: 5,
      confidenceScore: 0.38,
      topFactors: [
        { feature: 'deficit_hydrique', label_fr: '', label_ar: '', contribution: 2.0 },
      ],
    });

    expect(result.fr).toContain('à confirmer sur le terrain');
  });

  it('retombe sur GENERIC si aucun facteur n\'est fourni', () => {
    const result = service.build({
      irrigate: false,
      quantityMm: null,
      confidenceScore: 0.8,
      topFactors: [],
    });

    expect(result.reasonCode).toBe(REASON_CODES.GENERIC);
    expect(result.fr.length).toBeGreaterThan(0);
    expect(result.darija.length).toBeGreaterThan(0);
  });
});