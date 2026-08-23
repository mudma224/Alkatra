import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { KafkaService } from '../src/kafka/kafka.service';
import { IotMetricsService } from '../src/metrics/iot-metrics.service';

// Mock de KafkaJS — simule Kafka sans avoir besoin d'un vrai broker
jest.mock('kafkajs', () => ({
  Kafka: jest.fn().mockImplementation(() => ({
    producer: jest.fn().mockReturnValue({
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      send: jest.fn().mockResolvedValue([{ topicName: 'raw-sensor-data', partition: 0 }]),
    }),
  })),
  CompressionTypes: { GZIP: 2 },
  logLevel: { WARN: 2 },
}));

describe('KafkaService', () => {
  let service: KafkaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KafkaService,
        { provide: IotMetricsService, useValue: { setKafkaReady: jest.fn() } },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'KAFKA_BROKERS') return 'localhost:9092';
              return undefined;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<KafkaService>(KafkaService);
    await service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should be ready after init', () => {
    expect(service.isReady()).toBe(true);
  });

  it('should send a message to Kafka', async () => {
    const sendSpy = jest.spyOn(service, 'send');
    await service.send('raw-sensor-data', 'farm_001:parcel_A', { device_id: 'esp32-001' });
    expect(sendSpy).toHaveBeenCalledWith('raw-sensor-data', 'farm_001:parcel_A', {
      device_id: 'esp32-001',
    });
  });
});
