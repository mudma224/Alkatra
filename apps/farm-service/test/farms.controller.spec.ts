import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from '../src/common/guards/jwt-auth.guard';
import { FarmsController } from '../src/modules/farms/farms.controller';
import { FarmsService } from '../src/modules/farms/farms.service';
import { AuthClientService } from '../src/auth/auth-client.service';
import { HttpException, HttpStatus } from '@nestjs/common';

describe('FarmsController', () => {
  let controller: FarmsController;
  let farmsService: jest.Mocked<FarmsService>;
  let authClientService: jest.Mocked<AuthClientService>;

  const mockUser = {
    userId: '550e8400-e29b-41d4-a716-446655440001',
    phone: '+212600000001',
  };
  const mockFarm = {
    id: '660e8400-e29b-41d4-a716-446655440001',
    ownerId: mockUser.userId,
    name: 'Ferme Al Haouz',
    region: 'Marrakech-Safi',
    totalAreaHa: 15.5,
    location: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    parcels: [],
  };

  const mockFarmsService = {
    create: jest.fn(),
    findAllByOwner: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
  };

  const mockAuthClientService = {
    verifyUserExists: jest.fn(),
    getUserInfo: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FarmsController],
      providers: [
        { provide: FarmsService, useValue: mockFarmsService },
        { provide: AuthClientService, useValue: mockAuthClientService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<FarmsController>(FarmsController);
    farmsService = module.get(FarmsService);
    authClientService = module.get(AuthClientService);

    jest.clearAllMocks();
  });

  describe('create()', () => {
    it('✅ Devrait créer une ferme avec succès', async () => {
      const createDto = {
        name: 'Ferme Al Haouz',
        region: 'Marrakech-Safi',
        totalAreaHa: 15.5,
      };

      mockFarmsService.create.mockResolvedValue(mockFarm);
      const result = await controller.create(createDto, mockUser);

      expect(result).toEqual(mockFarm);
      expect(farmsService.create).toHaveBeenCalledWith(createDto, mockUser.userId);
    });

    it('❌ Devrait relayer l\'erreur du service', async () => {
      const createDto = { name: 'Ferme Test', totalAreaHa: 10 };
      mockFarmsService.create.mockRejectedValue(
        new HttpException('Aucun utilisateur trouvé pour cet ID. Création de ferme bloquée.', HttpStatus.NOT_FOUND),
      );

      await expect(controller.create(createDto, mockUser)).rejects.toThrow(
        'Aucun utilisateur trouvé pour cet ID. Création de ferme bloquée.',
      );
      expect(farmsService.create).toHaveBeenCalledWith(createDto, mockUser.userId);
    });
  });

  describe('findAll()', () => {
    it('✅ Devrait retourner les fermes de l\'utilisateur connecté', async () => {
      const farmsList = [mockFarm];
      mockFarmsService.findAllByOwner.mockResolvedValue(farmsList);
      const result = await controller.findAll(mockUser.userId);

      expect(result).toEqual(farmsList);
      expect(farmsService.findAllByOwner).toHaveBeenCalledWith(mockUser.userId);
    });

    it('✅ Devrait retourner une liste vide si aucune ferme', async () => {
      mockFarmsService.findAllByOwner.mockResolvedValue([]);
      const result = await controller.findAll(mockUser.userId);

      expect(result).toEqual([]);
    });
  });

  describe('findOne()', () => {
    it('✅ Devrait retourner une ferme existante', async () => {
      mockFarmsService.findOne.mockResolvedValue(mockFarm);
      const result = await controller.findOne(mockFarm.id, mockUser.userId);

      expect(result).toEqual(mockFarm);
    });

    it('❌ Devrait retourner 404 si la ferme n\'existe pas', async () => {
      mockFarmsService.findOne.mockRejectedValue(
        new HttpException('Ferme introuvable dans la base de données.', HttpStatus.NOT_FOUND),
      );

      await expect(controller.findOne('non-existent-id', mockUser.userId)).rejects.toThrow(HttpException);
    });

    it('❌ Devrait retourner 403 si la ferme appartient à un autre utilisateur', async () => {
      mockFarmsService.findOne.mockRejectedValue(
        new HttpException('Accès refusé : cette ferme n\'appartient pas à l\'utilisateur connecté.', HttpStatus.FORBIDDEN),
      );

      await expect(controller.findOne(mockFarm.id, mockUser.userId)).rejects.toThrow(HttpException);
    });
  });

  describe('remove()', () => {
    it('✅ Devrait supprimer une ferme avec succès', async () => {
      mockFarmsService.remove.mockResolvedValue(undefined);
      await expect(controller.remove(mockFarm.id, mockUser.userId)).resolves.toBeUndefined();
      expect(farmsService.remove).toHaveBeenCalledWith(mockFarm.id, mockUser.userId);
    });

    it('❌ Devrait échouer si la ferme n\'existe pas', async () => {
      mockFarmsService.remove.mockRejectedValue(
        new HttpException('Ferme introuvable dans la base de données.', HttpStatus.NOT_FOUND),
      );

      await expect(controller.remove('non-existent-id', mockUser.userId)).rejects.toThrow(HttpException);
    });

    it('❌ Devrait échouer si la ferme a des parcelles', async () => {
      mockFarmsService.remove.mockRejectedValue(
        new HttpException('Suppression impossible : la ferme possède 1 parcelle(s). Veuillez d\'abord les supprimer.', HttpStatus.CONFLICT),
      );

      await expect(controller.remove(mockFarm.id, mockUser.userId)).rejects.toThrow(HttpException);
    });
  });
});