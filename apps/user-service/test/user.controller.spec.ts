import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { UserController } from '../src/user/user.controller';
import { UserService } from '../src/user/user.service';

describe('UserController', () => {
  let controller: UserController;
  let userService: jest.Mocked<UserService>;

  const mockRequest = {
    user: {
      userId: 'uuid-user-1',
      phone: '+212612345678',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UserController],
      providers: [
        {
          provide: UserService,
          useValue: {
            getProfile: jest.fn(),
            updateProfile: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<UserController>(UserController);
    userService = module.get(UserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getProfile', () => {
    it('devrait retourner le profil de l\'utilisateur connecté', async () => {
      const expectedProfile = {
        id: 'uuid-user-1',
        phone: '+212612345678',
        name: 'Ahmed',
        preferredLanguage: 'fr',
        createdAt: '2026-06-28T11:18:00.000Z',
      };
      userService.getProfile.mockResolvedValue(expectedProfile);

      const result = await controller.getProfile(mockRequest as any);

      expect(userService.getProfile).toHaveBeenCalledWith('uuid-user-1');
      expect(result).toEqual(expectedProfile);
    });

    it('devrait propager NotFoundException du service', async () => {
      userService.getProfile.mockRejectedValue(
        new NotFoundException('Utilisateur introuvable'),
      );

      await expect(
        controller.getProfile(mockRequest as any),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateProfile', () => {
    it('devrait mettre à jour et retourner le profil', async () => {
      const dto = { name: 'Nouveau Nom' };
      const expectedProfile = {
        id: 'uuid-user-1',
        phone: '+212612345678',
        name: 'Nouveau Nom',
        preferredLanguage: 'fr',
        createdAt: '2026-06-28T11:18:00.000Z',
      };
      userService.updateProfile.mockResolvedValue(expectedProfile);

      const result = await controller.updateProfile(
        mockRequest as any,
        dto,
      );

      expect(userService.updateProfile).toHaveBeenCalledWith(
        'uuid-user-1',
        dto,
      );
      expect(result.name).toBe('Nouveau Nom');
    });
  });
});