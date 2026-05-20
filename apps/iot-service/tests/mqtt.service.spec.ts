import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MqttService } from '../src/mqtt/mqtt.service';
import { KafkaService } from '../src/kafka/kafka.service';

// Mock de la bibliothèque MQTT
jest.mock('mqtt', () => ({
  connect: jest.fn().mockReturnValue({
    on: jest.fn(),
    subscribe: jest.fn((topic, opts, cb) => cb && cb(null)),
    end: jest.fn(),
    connected: true,
  }),
}));

describe('MqttService', () => {
  let service: MqttService;
  let kafkaService: jest.Mocked<KafkaService>;

  beforeEach(async () => {
    const mockKafkaService = {
      send: jest.fn().mockResolvedValue(undefined),
      isReady: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MqttService,
        { provide: ConfigService, useValue: { get: jest.fn(() => 'mqtt://localhost:1883') } },
        { provide: KafkaService, useValue: mockKafkaService },
      ],
    }).compile();

    service = module.get<MqttService>(MqttService);
    kafkaService = module.get(KafkaService);
    await service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should detect anomaly for very low moisture', () => {
    const data = { soil_moisture_1: 2, soil_moisture_2: 50, air_temp: 25, battery_pct: 80 };
    const result = (service as any).detectAnomalies(data);
    expect(result.isAnomaly).toBe(true);
    expect(result.anomalyReasons).toContain('soil_moisture_1 hors limites: 2%');
  });

  it('should detect anomaly for low battery', () => {
    const data = { soil_moisture_1: 45, soil_moisture_2: 50, air_temp: 25, battery_pct: 10 };
    const result = (service as any).detectAnomalies(data);
    expect(result.isAnomaly).toBe(true);
    expect(result.anomalyReasons).toContain('batterie faible: 10%');
  });

  it('should not detect anomaly for normal data', () => {
    const data = { soil_moisture_1: 45, soil_moisture_2: 50, air_temp: 25, battery_pct: 80 };
    const result = (service as any).detectAnomalies(data);
    expect(result.isAnomaly).toBe(false);
    expect(result.anomalyReasons).toHaveLength(0);
  });

  it('should return stats', () => {
    const stats = service.getStats();
    expect(stats).toHaveProperty('messagesReceived');
    expect(stats).toHaveProperty('messagesForwarded');
    expect(stats).toHaveProperty('mqttConnected');
  });
});