import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { HttpException, HttpStatus } from '@nestjs/common';
import { ParcelsService } from '../src/modules/parcels/parcels.service';
import { Parcel } from '../src/database/entities/parcel.entity';
import { Farm } from '../src/database/entities/farm.entity';

describe('ParcelsService', () => {
  let service: ParcelsService;
  let parcelRepo: jest.Mocked<Repository<Parcel>>;
  let farmRepo: jest.Mocked<Repository<Farm>>;

  const mockUserId = '550e8400-e29b-41d4-a716-446655440001';
  const mockFarm = {
    id: '660e8400-e29b-41d4-a716-446655440001',
    ownerId: mockUserId,
    name: 'Ferme Test',
    region: 'Béni Mellal',
    totalAreaHa: 10,
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

  const mockParcelRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
    remove: jest.fn(),
  };

  const mockFarmRepo = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ParcelsService,
        { provide: getRepositoryToken(Parcel), useValue: mockParcelRepo },
        { provide: getRepositoryToken(Farm), useValue: mockFarmRepo },
      ],
    }).compile();

    service = module.get<ParcelsService>(ParcelsService);
    parcelRepo = module.get(getRepositoryToken(Parcel));
    farmRepo = module.get(getRepositoryToken(Farm));

    jest.clearAllMocks();
  });

  describe('create()', () => {
    it('✅ Devrait créer une parcelle avec succès', async () => {
      const createDto = {
        farmId: mockFarm.id,
        name: 'Parcelle Nord',
        areaHa: 2.5,
        cropType: 'olive' as const,
        soilType: 'clay' as const,
        irrigationMethod: 'drip' as const,
      };

      mockFarmRepo.findOne.mockResolvedValue(mockFarm as Farm);
      mockParcelRepo.find.mockResolvedValue([]);
      mockParcelRepo.create.mockReturnValue(mockParcel as Parcel);
      mockParcelRepo.save.mockResolvedValue(mockParcel as Parcel);

      const result = await service.create(createDto, mockUserId);
      expect(result).toEqual(mockParcel);
      expect(farmRepo.findOne).toHaveBeenCalledWith({
        where: { id: mockFarm.id, ownerId: mockUserId },
      });
      expect(parcelRepo.create).toHaveBeenCalled();
      expect(parcelRepo.save).toHaveBeenCalled();
    });

    it('❌ Devrait échouer si la ferme n\'existe pas', async () => {
      const createDto = {
        farmId: 'non-existent-farm',
        name: 'Parcelle Nord',
        areaHa: 2.5,
        cropType: 'olive' as const,
        soilType: 'clay' as const,
        irrigationMethod: 'drip' as const,
      };
      mockFarmRepo.findOne.mockResolvedValue(null);

      await expect(service.create(createDto, mockUserId)).rejects.toThrow(HttpException);
    });

    it('❌ Devrait échouer si la ferme appartient à un autre utilisateur', async () => {
      const createDto = {
        farmId: 'other-user-farm',
        name: 'Parcelle Nord',
        areaHa: 2.5,
        cropType: 'olive' as const,
        soilType: 'clay' as const,
        irrigationMethod: 'drip' as const,
      };
      mockFarmRepo.findOne.mockResolvedValue(null);

      await expect(service.create(createDto, mockUserId)).rejects.toThrow(HttpException);
    });

    it('❌ Devrait échouer si la surface dépasse celle de la ferme', async () => {
      const createDto = {
        farmId: mockFarm.id,
        name: 'Parcelle Trop Grande',
        areaHa: 12,
        cropType: 'olive' as const,
        soilType: 'clay' as const,
        irrigationMethod: 'drip' as const,
      };

      mockFarmRepo.findOne.mockResolvedValue(mockFarm as Farm);
      mockParcelRepo.find.mockResolvedValue([]);

      await expect(service.create(createDto, mockUserId)).rejects.toThrow(HttpException);
    });

    it('❌ Devrait échouer si une parcelle avec le même nom existe déjà (contrainte unique)', async () => {
      const createDto = {
        farmId: mockFarm.id,
        name: 'Parcelle Nord',
        areaHa: 2.5,
        cropType: 'olive' as const,
        soilType: 'clay' as const,
        irrigationMethod: 'drip' as const,
      };

      mockFarmRepo.findOne.mockResolvedValue(mockFarm as Farm);
      mockParcelRepo.find.mockResolvedValue([]);
      mockParcelRepo.create.mockReturnValue(mockParcel as Parcel);
      mockParcelRepo.save.mockRejectedValue(
        new Error('duplicate key value violates unique constraint "parcels_farm_id_name_unique"'),
      );

      await expect(service.create(createDto, mockUserId)).rejects.toThrow();
    });
  });

  describe('findOne()', () => {
    it('✅ Devrait retourner une parcelle existante', async () => {
      mockParcelRepo.findOne.mockResolvedValue(mockParcel as Parcel);
      const result = await service.findOne(mockParcel.id, mockUserId);

      expect(result).toEqual(mockParcel);
    });

    it('❌ Devrait retourner 404 si la parcelle n\'existe pas', async () => {
      mockParcelRepo.findOne.mockResolvedValue(null);

      await expect(service.findOne('non-existent-id', mockUserId)).rejects.toThrow(HttpException);
    });
  });
});