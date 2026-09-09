import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { HealthController } from '../src/health/health.controller';
import { SyncConsumerService } from '../src/sync/sync-consumer.service';

describe('HealthController', () => {
  let controller: HealthController;
  let dataSource: jest.Mocked<DataSource>;
  let syncConsumer: jest.Mocked<Pick<SyncConsumerService, 'isConnected'>>;

  beforeEach(async () => {
    dataSource = { query: jest.fn() } as unknown as jest.Mocked<DataSource>;
    syncConsumer = { isConnected: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: SyncConsumerService, useValue: syncConsumer },
      ],
    }).compile();

    controller = module.get(HealthController);
  });

  it('liveness retourne status ok', () => {
    const result = controller.liveness();
    expect(result.status).toBe('ok');
    expect(result.service).toBe('recommendation-service');
  });

  it('readiness est ok quand DB et Kafka sont up', async () => {
    dataSource.query.mockResolvedValue([{ '?column?': 1 }]);
    syncConsumer.isConnected.mockReturnValue(true);

    const result = await controller.readiness();

    expect(result.status).toBe('ok');
    expect(result.dependencies).toEqual({ database: 'up', kafka: 'up' });
  });

  it('readiness est degraded quand Kafka est down', async () => {
    dataSource.query.mockResolvedValue([{ '?column?': 1 }]);
    syncConsumer.isConnected.mockReturnValue(false);

    const result = await controller.readiness();

    expect(result.status).toBe('degraded');
    expect(result.dependencies.kafka).toBe('down');
  });

  it('readiness est degraded quand la DB est down', async () => {
    dataSource.query.mockRejectedValue(new Error('connection refused'));
    syncConsumer.isConnected.mockReturnValue(true);

    const result = await controller.readiness();

    expect(result.status).toBe('degraded');
    expect(result.dependencies.database).toBe('down');
  });
});
