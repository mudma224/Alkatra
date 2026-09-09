import { Test, TestingModule } from '@nestjs/testing';
import { RecommendationsController } from '../src/recommendations/recommendations.controller';
import { RecommendationsService } from '../src/recommendations/recommendations.service';
import { FarmClientService } from '../src/recommendations/farm-client.service';
import { AuthenticatedUser } from '../src/common/strategies/jwt.strategy';

describe('RecommendationsController', () => {
  let controller: RecommendationsController;
  let service: jest.Mocked<RecommendationsService>;
  let farmClient: jest.Mocked<FarmClientService>;

  const user: AuthenticatedUser = {
    userId: 'user-1',
    phone: '+212600000000',
    authorization: 'Bearer token',
  };

  const parcelId = '11111111-1111-4111-8111-111111111111';
  const recoId = '22222222-2222-2222-2222-222222222222';

  beforeEach(async () => {
    service = {
      findTodayByParcel: jest.fn(),
      findHistoryByParcel: jest.fn(),
      submitFeedback: jest.fn(),
      markAsExecuted: jest.fn(),
      getParcelIdOf: jest.fn(),
    } as unknown as jest.Mocked<RecommendationsService>;

    farmClient = { assertParcelOwnership: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<FarmClientService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RecommendationsController],
      providers: [
        { provide: RecommendationsService, useValue: service },
        { provide: FarmClientService, useValue: farmClient },
      ],
    }).compile();

    controller = module.get(RecommendationsController);
  });

  it('getToday vérifie la propriété puis délègue au service', async () => {
    service.findTodayByParcel.mockResolvedValue({ id: recoId } as never);

    const result = await controller.getToday(parcelId, user);

    expect(farmClient.assertParcelOwnership).toHaveBeenCalledWith(parcelId, user.authorization);
    expect(service.findTodayByParcel).toHaveBeenCalledWith(parcelId);
    expect(result).toEqual({ id: recoId });
  });

  it('getHistory passe limit/offset au service', async () => {
    service.findHistoryByParcel.mockResolvedValue({ total: 0, items: [] } as never);

    await controller.getHistory(parcelId, user, 10, 20);

    expect(service.findHistoryByParcel).toHaveBeenCalledWith(parcelId, 10, 20);
  });

  it('submitFeedback récupère la parcelle puis applique le feedback', async () => {
    service.getParcelIdOf.mockResolvedValue(parcelId);
    service.submitFeedback.mockResolvedValue({ id: recoId } as never);

    await controller.submitFeedback(recoId, user, { feedback: 'accepted' });

    expect(service.getParcelIdOf).toHaveBeenCalledWith(recoId);
    expect(service.submitFeedback).toHaveBeenCalledWith(recoId, { feedback: 'accepted' });
  });

  it('execute marque la recommandation comme exécutée', async () => {
    service.getParcelIdOf.mockResolvedValue(parcelId);
    service.markAsExecuted.mockResolvedValue({ id: recoId, status: 'executed' } as never);

    const result = await controller.execute(recoId, user);

    expect(result).toEqual({ id: recoId, status: 'executed' });
  });
});
