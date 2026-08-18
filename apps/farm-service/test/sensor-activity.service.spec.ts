import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SensorActivityService } from '../src/modules/sensors/sensor-activity.service';
import { Sensor } from '../src/database/entities/sensor.entity';

describe('SensorActivityService', () => {
  let service: SensorActivityService;
  let sensorRepo: { createQueryBuilder: jest.Mock };

  const mockExecute = jest.fn();
  const mockUpdate = jest.fn();
  const mockSet = jest.fn();
  const mockWhere = jest.fn();

  beforeEach(async () => {
    mockExecute.mockReset();
    mockUpdate.mockReset().mockReturnThis();
    mockSet.mockReset().mockReturnThis();
    mockWhere.mockReset().mockReturnThis();

    mockExecute.mockResolvedValue({ affected: 0 });
    mockSet.mockReturnValue({ where: mockWhere });
    mockWhere.mockReturnValue({ execute: mockExecute });
    mockUpdate.mockReturnValue({ set: mockSet });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SensorActivityService,
        {
          provide: getRepositoryToken(Sensor),
          useValue: { createQueryBuilder: jest.fn().mockReturnValue({ update: mockUpdate }) },
        },
      ],
    }).compile();

    service = module.get<SensorActivityService>(SensorActivityService);
    sensorRepo = module.get(getRepositoryToken(Sensor));
  });

  it('✅ Devrait désactiver uniquement les capteurs silencieux depuis plus de 48 h', async () => {
    mockExecute.mockResolvedValueOnce({ affected: 2 });

    const affected = await service.deactivateStaleSensors();

    expect(affected).toBe(2);
    expect(sensorRepo.createQueryBuilder).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith({ isActive: false });
    expect(mockWhere).toHaveBeenCalledWith(
      expect.stringContaining('"last_seen_at" < :threshold'),
      expect.objectContaining({ threshold: expect.any(Date) }),
    );

    // Le seuil correspond bien à 48 h avant maintenant (tolérance 1 s).
    const threshold = mockWhere.mock.calls[0][1].threshold as Date;
    const expected = Date.now() - SensorActivityService.SILENCE_MS;
    expect(Math.abs(threshold.getTime() - expected)).toBeLessThan(1000);
  });

  it('✅ Devrait retourner 0 si aucun capteur n\'est silencieux', async () => {
    mockExecute.mockResolvedValueOnce({ affected: 0 });

    await expect(service.deactivateStaleSensors()).resolves.toBe(0);
  });
});
