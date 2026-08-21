import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';

import { HealthController } from '../src/health/health.controller';
import { RecommendationsConsumer } from '../src/consumers/recommendations.consumer';

describe('HealthController', () => {
  let controller: HealthController;
  let dataSource: { query: jest.Mock };
  let consumer: { isConnected: jest.Mock };

  beforeEach(async () => {
    dataSource = { query: jest.fn().mockResolvedValue(undefined) };
    consumer = { isConnected: jest.fn().mockReturnValue(true) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: RecommendationsConsumer, useValue: consumer },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('✅ Devrait répondre ok sur le liveness', () => {
    const result = controller.liveness();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('alert-service');
  });

  it('✅ Devrait répondre ok si base et Kafka sont up', async () => {
    const result = await controller.readiness();
    expect(result.status).toBe('ok');
    expect(result.dependencies).toEqual({ database: 'up', kafka: 'up' });
  });

  it('⚠️ Devrait répondre degraded si Kafka est down (readiness jamais en échec HTTP)', async () => {
    consumer.isConnected.mockReturnValueOnce(false);
    const result = await controller.readiness();
    expect(result.status).toBe('degraded');
    expect(result.dependencies).toEqual({ database: 'up', kafka: 'down' });
  });

  it('⚠️ Devrait répondre degraded si la base est down', async () => {
    dataSource.query.mockRejectedValueOnce(new Error('conn refused'));
    const result = await controller.readiness();
    expect(result.status).toBe('degraded');
    expect(result.dependencies).toEqual({ database: 'down', kafka: 'up' });
  });
});
