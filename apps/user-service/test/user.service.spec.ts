import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserService } from '../src/user/user.service';

// Mock axios
jest.mock('axios', () => ({
  get: jest.fn(),
  patch: jest.fn(),
}));

import axios from 'axios';

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('UserService', () => {
  let service: UserService;

  const mockProfile = {
    id: 'uuid-user-1',
    phone: '+212612345678',
    name: 'Ahmed',
    preferredLanguage: 'fr',
    createdAt: '2026-06-28T11:18:00.000Z',
  };

  beforeEach(async () => {
    const configMock = {
      get: jest.fn((key: string) => {
        const values: Record<string, string> = {
          AUTH_SERVICE_HOST: 'localhost',
          AUTH_SERVICE_PORT: '3001',
        };
        return values[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
    jest.clearAllMocks();
  });

  describe('getProfile', () => {
    it('devrait retourner le profil si l\'utilisateur existe', async () => {
      mockedAxios.get.mockResolvedValue({ data: mockProfile });

      const result = await service.getProfile('uuid-user-1');

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'http://localhost:3001/internal/user/uuid-user-1',
      );
      expect(result).toEqual(mockProfile);
    });

    it('devrait lever NotFoundException si l\'utilisateur n\'existe pas (404)', async () => {
      const error: any = new Error('Not Found');
      error.response = { status: 404 };
      mockedAxios.get.mockRejectedValue(error);

      await expect(
        service.getProfile('uuid-inexistant'),
      ).rejects.toThrow(NotFoundException);

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'http://localhost:3001/internal/user/uuid-inexistant',
      );
    });
  });

  describe('updateProfile', () => {
    it('devrait mettre à jour et retourner le profil', async () => {
      const updatedProfile = { ...mockProfile, name: 'Nouveau Nom' };
      mockedAxios.patch.mockResolvedValue({ data: updatedProfile });

      const result = await service.updateProfile('uuid-user-1', { name: 'Nouveau Nom' });

      expect(mockedAxios.patch).toHaveBeenCalledWith(
        'http://localhost:3001/internal/user/uuid-user-1',
        { name: 'Nouveau Nom' },
      );
      expect(result.name).toBe('Nouveau Nom');
    });

    it('devrait lever NotFoundException si l\'utilisateur n\'existe pas', async () => {
      const error: any = new Error('Not Found');
      error.response = { status: 404 };
      mockedAxios.patch.mockRejectedValue(error);

      await expect(
        service.updateProfile('uuid-inexistant', { name: 'Qui ?' }),
      ).rejects.toThrow(NotFoundException);
    });
  });
});