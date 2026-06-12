import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MqttService } from '../src/mqtt/mqtt.service';
import { KafkaService } from '../src/kafka/kafka.service';

jest.mock('mqtt', () => ({
  connect: jest.fn().mockReturnValue({
    on: jest.fn(),
    subscribe: jest.fn((topic, opts, cb) => cb && cb(null)),
    end: jest.fn(),
    connected: true,
  }),
}));

const validPayload = {
  ts: 1710000000,
  device_id: 'esp32-001',
  farm_id: 'farm_001',
  parcel_id: 'parcel_A',
  temperature_min_c: 12.5,
  temperature_max_c: 31.2,
  wind_speed_ms: 4.7,
  solar_radiation_mj_m2_day: 21.4,
  soil_humidity_pct: 46.8,
  air_humidity_pct: 62.1,
  rain_mm_day: 3.4,
};

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

  it('should validate the seven required AI sensor variables', () => {
    expect((service as any).isValidPayload(validPayload)).toBe(true);
<<<<<<< HEAD
    expect((service as any).isValidPayload({ ...validPayload, wind_speed_ms: undefined })).toBe(
      false,
    );
=======
    expect((service as any).isValidPayload({ ...validPayload, wind_speed_ms: undefined })).toBe(false);
    expect((service as any).isValidPayload({ ...validPayload, rain_mm_day: undefined })).toBe(false);
>>>>>>> feat/s3-spark-ml
  });

  it('should detect anomaly when min temperature is greater than max temperature', () => {
    const result = (service as any).detectAnomalies({
      ...validPayload,
      temperature_min_c: 35,
      temperature_max_c: 20,
    });

    expect(result.isAnomaly).toBe(true);
    expect(result.anomalyReasons).toContain(
      'temperature_min_c superieure a temperature_max_c: 35C > 20C',
    );
  });

  it('should detect anomaly for out-of-range humidity', () => {
    const result = (service as any).detectAnomalies({
      ...validPayload,
      soil_humidity_pct: 140,
    });

    expect(result.isAnomaly).toBe(true);
    expect(result.anomalyReasons).toContain('soil_humidity_pct hors limites: 140%');
  });

  it('should detect anomaly for out-of-range daily rain', () => {
    const result = (service as any).detectAnomalies({
      ...validPayload,
      rain_mm_day: -2,
    });

    expect(result.isAnomaly).toBe(true);
    expect(result.anomalyReasons).toContain('rain_mm_day hors limites: -2 mm/jour');
  });

  it('should not detect anomaly for normal AI features', () => {
    const result = (service as any).detectAnomalies(validPayload);
    expect(result.isAnomaly).toBe(false);
    expect(result.anomalyReasons).toHaveLength(0);
  });

  it('should normalize and forward a valid MQTT payload to Kafka', async () => {
    await (service as any).handleMessage(
      'alkatra/farm/farm_001/parcel/parcel_A/sensor/esp32-001/data',
      Buffer.from(JSON.stringify(validPayload)),
    );

    expect(kafkaService.send).toHaveBeenCalledTimes(1);
    expect(kafkaService.send).toHaveBeenCalledWith(
      'raw-sensor-data',
      'farm_001:parcel_A',
      expect.objectContaining({
        schema_version: 'sensor-ai-v2',
        device_id: 'esp32-001',
        farm_id: 'farm_001',
        parcel_id: 'parcel_A',
        temperature_min_c: 12.5,
        temperature_max_c: 31.2,
        wind_speed_ms: 4.7,
        solar_radiation_mj_m2_day: 21.4,
        soil_humidity_pct: 46.8,
        air_humidity_pct: 62.1,
        rain_mm_day: 3.4,
        is_anomaly: false,
        anomaly_reasons: [],
      }),
    );
  });

  it('should reject invalid MQTT payloads before Kafka', async () => {
    await (service as any).handleMessage(
      'alkatra/farm/farm_001/parcel/parcel_A/sensor/esp32-001/data',
      Buffer.from(JSON.stringify({ ...validPayload, solar_radiation_mj_m2_day: undefined })),
    );

    expect(kafkaService.send).not.toHaveBeenCalled();
  });

  it('should return stats', () => {
    const stats = service.getStats();
    expect(stats).toHaveProperty('messagesReceived');
    expect(stats).toHaveProperty('messagesForwarded');
    expect(stats).toHaveProperty('mqttConnected');
  });
});
