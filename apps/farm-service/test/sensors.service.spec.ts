import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpException, HttpStatus } from '@nestjs/common';
import { SensorsService } from '../src/modules/sensors/sensors.service';
import { Sensor } from '../src/database/entities/sensor.entity';
import { Parcel } from '../src/database/entities/parcel.entity';
import { FarmMetricsService } from '../src/metrics/farm-metrics.service';

describe('SensorsService', () => {
  let service: SensorsService;
  let sensorRepo: jest.Mocked<Repository<Sensor>>;
  let parcelRepo: jest.Mocked<Repository<Parcel>>;

  const mockUserId = '550e8400-e29b-41d4-a716-446655440001';
  const mockFarm = {
    id: '660e8400-e29b-41d4-a716-446655440001',
    ownerId: mockUserId,
    name: 'Ferme Test',
    totalAreaHa: 10,
    region: 'Test',
    location: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    parcels: [],
  };
  const mockParcel = {
    id: '770e8400-e29b-41d4-a716-446655440001',
    farmId: mockFarm.id,
    farm: mockFarm,
    name: 'Parcelle Nord',
    areaHa: 2.5,
    cropType: 'olive',
    soilType: 'clay',
    irrigationMethod: 'drip',
    cropVariety: null,
    flowRateM3h: null,
    treeAgeYears: null,
    treeDensityPerHa: null,
    polygon: null,
    centroid: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSensor = {
    id: '880e8400-e29b-41d4-a716-446655440001',
    deviceId: 'SENSOR-OL-001',
    parcelId: mockParcel.id,
    parcel: null,
    deviceType: 'esp32-wroom-32',
    healthStatus: 'active',
    batteryPct: null,
    firmwareVersion: null,
    lastSeenAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSensorRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    remove: jest.fn(),
  };

  const mockParcelRepo = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SensorsService,
        { provide: getRepositoryToken(Sensor), useValue: mockSensorRepo },
        { provide: getRepositoryToken(Parcel), useValue: mockParcelRepo },
        { provide: FarmMetricsService, useValue: { recordHeartbeatOk: jest.fn(), recordHeartbeatError: jest.fn() } },
      ],
    }).compile();

    service = module.get<SensorsService>(SensorsService);
    sensorRepo = module.get(getRepositoryToken(Sensor));
    parcelRepo = module.get(getRepositoryToken(Parcel));

    jest.clearAllMocks();
  });

  describe('associate()', () => {
    it('✅ Devrait associer un nouveau capteur à une parcelle', async () => {
      const dto = { deviceId: 'SENSOR-OL-001', parcelId: mockParcel.id };

      mockParcelRepo.findOne.mockResolvedValue(mockParcel as any);
      mockSensorRepo.findOne.mockResolvedValue(null);
      mockSensorRepo.create.mockReturnValue(mockSensor as any);
      mockSensorRepo.save.mockResolvedValue(mockSensor as any);

      const result = await service.associate(dto, mockUserId);

      expect(result).toEqual(mockSensor);
      expect(parcelRepo.findOne).toHaveBeenCalledWith({
        where: { id: mockParcel.id },
        relations: { farm: true },
      });
      expect(sensorRepo.create).toHaveBeenCalled();
      expect(sensorRepo.save).toHaveBeenCalled();
    });

    it('✅ Devrait réassocier un capteur existant à une nouvelle parcelle', async () => {
      const existingSensor = {
        ...mockSensor,
        parcelId: 'old-parcel-id',
      };
      const dto = { deviceId: 'SENSOR-OL-001', parcelId: mockParcel.id };

      mockParcelRepo.findOne.mockResolvedValue(mockParcel as any);
      mockSensorRepo.findOne.mockResolvedValue(existingSensor as any);
      // mock pour l'ancienne parcelle
      mockParcelRepo.findOne.mockResolvedValueOnce(mockParcel as any);
      mockParcelRepo.findOne.mockResolvedValueOnce(mockParcel as any);
      mockSensorRepo.save.mockResolvedValue(mockSensor as any);

      const result = await service.associate(dto, mockUserId);

      expect(result.parcelId).toEqual(mockParcel.id);
      expect(sensorRepo.save).toHaveBeenCalled();
    });

    it('✅ Devrait ne pas modifier le capteur si déjà sur la bonne parcelle', async () => {
      const existingSensor = { ...mockSensor, parcelId: mockParcel.id };
      const dto = { deviceId: 'SENSOR-OL-001', parcelId: mockParcel.id };

      mockParcelRepo.findOne.mockResolvedValue(mockParcel as any);
      mockSensorRepo.findOne.mockResolvedValue(existingSensor as any);

      const result = await service.associate(dto, mockUserId);

      expect(result).toEqual(existingSensor);
      expect(sensorRepo.save).not.toHaveBeenCalled();
    });

    it('❌ Devrait retourner 403 si la parcelle appartient à un autre utilisateur', async () => {
      const dto = { deviceId: 'SENSOR-OL-001', parcelId: 'other-parcel' };
      const otherParcel = {
        ...mockParcel,
        farm: { ...mockFarm, ownerId: 'other-user' },
      };

      mockParcelRepo.findOne.mockResolvedValue(otherParcel as any);

      await expect(service.associate(dto, mockUserId)).rejects.toThrow(HttpException);
      expect(sensorRepo.create).not.toHaveBeenCalled();
    });

    it('❌ Devrait retourner 404 si la parcelle n\'existe pas', async () => {
      const dto = { deviceId: 'SENSOR-OL-001', parcelId: 'non-existent' };

      mockParcelRepo.findOne.mockResolvedValue(null);

      await expect(service.associate(dto, mockUserId)).rejects.toThrow(HttpException);
    });

    it('❌ Devrait refuser de voler un capteur d\'un autre utilisateur', async () => {
      const existingSensor = {
        ...mockSensor,
        parcelId: 'other-user-parcel',
      };
      const otherParcel = {
        ...mockParcel,
        id: 'other-user-parcel',
        farm: { ...mockFarm, ownerId: 'other-user' },
      };
      const dto = { deviceId: 'SENSOR-OL-001', parcelId: mockParcel.id };

      mockParcelRepo.findOne
        .mockResolvedValueOnce(mockParcel as any)  // nouvelle parcelle OK
        .mockResolvedValueOnce(otherParcel as any); // ancienne parcelle appartient à un autre
      mockSensorRepo.findOne.mockResolvedValue(existingSensor as any);

      await expect(service.associate(dto, mockUserId)).rejects.toThrow(HttpException);
      expect(sensorRepo.save).not.toHaveBeenCalled();
    });

    it('✅ Devrait gérer le cas où le deviceId est déjà unique (contrainte PostgreSQL)', async () => {
      const dto = { deviceId: 'SENSOR-OL-001', parcelId: mockParcel.id };

      mockParcelRepo.findOne.mockResolvedValue(mockParcel as any);
      mockSensorRepo.findOne.mockResolvedValue(null);
      mockSensorRepo.create.mockReturnValue(mockSensor as any);
      mockSensorRepo.save.mockRejectedValue(
        new Error('duplicate key value violates unique constraint "sensors_device_id_key"'),
      );

      await expect(service.associate(dto, mockUserId)).rejects.toThrow();
    });
  });

  describe('findByParcel()', () => {
    it('✅ Devrait retourner les capteurs de la parcelle', async () => {
      mockParcelRepo.findOne.mockResolvedValue(mockParcel as any);
      mockSensorRepo.find.mockResolvedValue([mockSensor] as any);

      const result = await service.findByParcel(mockParcel.id, mockUserId);

      expect(result).toEqual([mockSensor]);
      expect(parcelRepo.findOne).toHaveBeenCalledWith({
        where: { id: mockParcel.id },
        relations: { farm: true },
      });
      expect(sensorRepo.find).toHaveBeenCalledWith({ where: { parcelId: mockParcel.id } });
    });

    it('✅ Devrait retourner une liste vide si aucun capteur', async () => {
      mockParcelRepo.findOne.mockResolvedValue(mockParcel as any);
      mockSensorRepo.find.mockResolvedValue([] as any);

      const result = await service.findByParcel(mockParcel.id, mockUserId);

      expect(result).toEqual([]);
    });

    it('❌ Devrait retourner 404 si la parcelle n\'existe pas', async () => {
      mockParcelRepo.findOne.mockResolvedValue(null);

      await expect(service.findByParcel('non-existent', mockUserId)).rejects.toThrow(HttpException);
      expect(sensorRepo.find).not.toHaveBeenCalled();
    });

    it('❌ Devrait retourner 403 si la parcelle appartient à un autre utilisateur', async () => {
      mockParcelRepo.findOne.mockResolvedValue(null);

      await expect(service.findByParcel(mockParcel.id, mockUserId)).rejects.toThrow(HttpException);
      expect(sensorRepo.find).not.toHaveBeenCalled();
    });
  });

  describe('dissociate()', () => {
    it('✅ Devrait dissocier un capteur appartenant à l\'utilisateur', async () => {
      mockSensorRepo.findOne.mockResolvedValue(mockSensor as any);
      mockParcelRepo.findOne.mockResolvedValue(mockParcel as any);
      mockSensorRepo.remove.mockResolvedValue(mockSensor as any);

      await expect(service.dissociate(mockSensor.id, mockUserId)).resolves.toBeUndefined();

      expect(sensorRepo.remove).toHaveBeenCalledWith(mockSensor);
    });

    it('❌ Devrait retourner 404 si le capteur n\'existe pas', async () => {
      mockSensorRepo.findOne.mockResolvedValue(null);

      await expect(service.dissociate('non-existent', mockUserId)).rejects.toThrow(HttpException);
      expect(sensorRepo.remove).not.toHaveBeenCalled();
    });

    it('❌ Devrait retourner 403 si le capteur appartient à un autre utilisateur', async () => {
      const otherFarm = { ...mockFarm, ownerId: 'other-user' };
      mockSensorRepo.findOne.mockResolvedValue(mockSensor as any);
      mockParcelRepo.findOne.mockResolvedValue({ ...mockParcel, farm: otherFarm } as any);

      await expect(service.dissociate(mockSensor.id, mockUserId)).rejects.toThrow(HttpException);
      expect(sensorRepo.remove).not.toHaveBeenCalled();
    });
  });

  describe('recordHeartbeat()', () => {
    it('✅ Devrait rafraîchir last_seen_at, réactiver et enregistrer la batterie', async () => {
      const silentSensor = { ...mockSensor, healthStatus: 'failing', batteryPct: null };
      mockSensorRepo.findOne.mockResolvedValue(silentSensor as any);
      mockSensorRepo.save.mockImplementation(async (sensor) => sensor as any);

      const result = await service.recordHeartbeat('SENSOR-OL-001', { batteryPct: 87 });

      expect(result.healthStatus).toBe('active');
      expect(result.batteryPct).toBe(87);
      expect(result.lastSeenAt).toBeInstanceOf(Date);
      expect(sensorRepo.save).toHaveBeenCalled();
    });

    it('✅ Devrait ignorer batterie et firmware si absents du heartbeat', async () => {
      mockSensorRepo.findOne.mockResolvedValue({ ...mockSensor, firmwareVersion: '1.0.0' } as any);
      mockSensorRepo.save.mockImplementation(async (sensor) => sensor as any);

      const result = await service.recordHeartbeat('SENSOR-OL-001', {});

      expect(result.batteryPct).toBeNull();
      expect(result.firmwareVersion).toBe('1.0.0');
    });

    it('❌ Devrait retourner 404 si le deviceId est inconnu', async () => {
      mockSensorRepo.findOne.mockResolvedValue(null);

      await expect(service.recordHeartbeat('UNKNOWN', {})).rejects.toThrow(HttpException);
      expect(sensorRepo.save).not.toHaveBeenCalled();
    });
  });
});