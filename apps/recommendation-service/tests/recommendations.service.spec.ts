import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Recommendation } from '../src/entities/recommendation.entity';
import { MetricsService } from '../src/metrics/metrics.service';
import { RecommendationsService } from '../src/recommendations/recommendations.service';

describe('RecommendationsService', () => {
  let service: RecommendationsService;
  let repo: jest.Mocked<Repository<Recommendation>>;

  const baseReco = {
    id: '22222222-2222-2222-2222-222222222222',
    parcelId: '11111111-1111-4111-8111-111111111111',
    generatedAt: new Date(),
    irrigate: true,
    confidenceScore: 0.88,
    quantityMm: 12.5,
    durationMinutes: null,
    reasonCode: 'LOW_SOIL_MOISTURE',
    shapFactors: [],
    explanationTextFr: 'Il faut irriguer aujourd\'hui.',
    explanationTextDarija: 'خاصك تسقي اليوم.',
    soilHumidityPctAtGen: null,
    etoAtGen: null,
    modelVersion: '1.0.0',
    status: 'pending',
    userFeedback: null,
    feedbackAt: null,
    demoMode: false,
    createdAt: new Date(),
  } as Recommendation;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecommendationsService,
        { provide: MetricsService, useValue: { recordFeedback: jest.fn() } },
        {
          provide: getRepositoryToken(Recommendation),
          useValue: {
            findOne: jest.fn(),
            findAndCount: jest.fn(),
            save: jest.fn((x) => Promise.resolve(x)),
            createQueryBuilder: jest.fn().mockReturnValue({
              update: jest.fn().mockReturnThis(),
              set: jest.fn().mockReturnThis(),
              where: jest.fn().mockReturnThis(),
              execute: jest.fn().mockResolvedValue({ affected: 1 }),
            }),
          },
        },
      ],
    }).compile();

    service = module.get(RecommendationsService);
    repo = module.get(getRepositoryToken(Recommendation));
  });

  describe('findTodayByParcel', () => {
    it('retourne la recommandation du jour au format DTO', async () => {
      repo.findOne.mockResolvedValue({ ...baseReco });

      const result = await service.findTodayByParcel(baseReco.parcelId);

      expect(result.id).toBe(baseReco.id);
      expect(result.explanation.fr).toBe(baseReco.explanationTextFr);
      expect(result.explanation.darija).toBe(baseReco.explanationTextDarija);
      expect(result.demoMode).toBe(false);
    });

    it('bascule le statut pending → seen à la première lecture (update atomique)', async () => {
      repo.findOne.mockResolvedValue({ ...baseReco, status: 'pending' });

      await service.findTodayByParcel(baseReco.parcelId);

      expect(repo.createQueryBuilder).toHaveBeenCalled();
    });

    it('lève NotFoundException si aucune recommandation du jour', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.findTodayByParcel(baseReco.parcelId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('findHistoryByParcel', () => {
    it('retourne un historique paginé', async () => {
      repo.findAndCount.mockResolvedValue([[baseReco], 1]);

      const result = await service.findHistoryByParcel(baseReco.parcelId, 10, 0);

      expect(result.total).toBe(1);
      expect(result.items).toHaveLength(1);
    });

    it('plafonne la limite à 100', async () => {
      repo.findAndCount.mockResolvedValue([[], 0]);

      await service.findHistoryByParcel(baseReco.parcelId, 5000, 0);

      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ take: 100 }),
      );
    });
  });

  describe('submitFeedback', () => {
    it('enregistre un feedback accepted et met à jour le statut', async () => {
      repo.findOne.mockResolvedValue({ ...baseReco });

      const result = await service.submitFeedback(baseReco.id, { feedback: 'accepted' });

      expect(result.userFeedback).toBe('accepted');
      expect(result.status).toBe('accepted');
    });

    it('marque expired lorsque le feedback est ignored', async () => {
      repo.findOne.mockResolvedValue({ ...baseReco });

      const result = await service.submitFeedback(baseReco.id, { feedback: 'ignored' });

      expect(result.status).toBe('expired');
    });

    it('autorise le changement d\'avis accepted → rejected', async () => {
      repo.findOne.mockResolvedValue({ ...baseReco, status: 'accepted' });

      const result = await service.submitFeedback(baseReco.id, { feedback: 'rejected' });

      expect(result.status).toBe('rejected');
    });

    it('rejette un feedback non autorisé depuis un statut donné (accepted → accepted)', async () => {
      repo.findOne.mockResolvedValue({ ...baseReco, status: 'accepted' });

      await expect(
        service.submitFeedback(baseReco.id, { feedback: 'accepted' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejette le feedback si le statut est executed (verrouillé)', async () => {
      repo.findOne.mockResolvedValue({ ...baseReco, status: 'executed' });

      await expect(
        service.submitFeedback(baseReco.id, { feedback: 'accepted' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejette le feedback si le statut est expired (verrouillé)', async () => {
      repo.findOne.mockResolvedValue({ ...baseReco, status: 'expired' });

      await expect(
        service.submitFeedback(baseReco.id, { feedback: 'accepted' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lève NotFoundException si la recommandation n\'existe pas', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(
        service.submitFeedback(baseReco.id, { feedback: 'accepted' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('markAsExecuted', () => {
    it('marque une recommandation accepted comme exécutée', async () => {
      repo.findOne.mockResolvedValue({ ...baseReco, status: 'accepted' });

      const result = await service.markAsExecuted(baseReco.id);

      expect(result.status).toBe('executed');
    });

    it('rejette l\'exécution si le statut n\'est pas accepted', async () => {
      repo.findOne.mockResolvedValue({ ...baseReco, status: 'pending' });

      await expect(service.markAsExecuted(baseReco.id)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('lève NotFoundException si la recommandation n\'existe pas', async () => {
      repo.findOne.mockResolvedValue(null);

      await expect(service.markAsExecuted(baseReco.id)).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});