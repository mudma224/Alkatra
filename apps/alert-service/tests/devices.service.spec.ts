import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException, HttpException } from '@nestjs/common';

import { DevicesService } from '../src/devices/devices.service';
import { DeviceToken } from '../src/database/entities/device-token.entity';

describe('DevicesService', () => {
  let service: DevicesService;
  let tokensRepo: {
    findOne: jest.Mock;
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };

  const dto = { token: 'fcm-token-long-enough-abc123', platform: 'android' as const };

  beforeEach(async () => {
    tokensRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation((v) => v),
      save: jest.fn().mockImplementation((v) => v),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevicesService,
        { provide: getRepositoryToken(DeviceToken), useValue: tokensRepo },
      ],
    }).compile();

    service = module.get<DevicesService>(DevicesService);
  });

  describe('register', () => {
    it('✅ Devrait créer un nouveau token', async () => {
      await service.register('user-1', dto);
      expect(tokensRepo.create).toHaveBeenCalledWith({
        userId: 'user-1',
        token: dto.token,
        platform: 'android',
      });
      expect(tokensRepo.save).toHaveBeenCalled();
    });

    it('✅ Devrait ré-enregistrer (lastSeenAt + réactivation) un token existant du même user', async () => {
      const existing = {
        id: 'dt-1',
        userId: 'user-1',
        token: dto.token,
        platform: 'ios',
        revokedAt: new Date(),
        lastSeenAt: new Date('2026-01-01'),
      };
      tokensRepo.findOne.mockResolvedValueOnce(existing);

      const saved = await service.register('user-1', { ...dto, platform: 'web' });
      expect(saved.revokedAt).toBeNull();
      expect(saved.platform).toBe('web');
      expect(saved.lastSeenAt.getTime()).toBeGreaterThan(
        new Date('2026-01-01').getTime(),
      );
      expect(tokensRepo.create).not.toHaveBeenCalled();
    });

    it('❌ Devrait refuser (409) un token appartenant à un autre utilisateur', async () => {
      tokensRepo.findOne.mockResolvedValueOnce({
        id: 'dt-1',
        userId: 'user-2',
        token: dto.token,
      });
      await expect(service.register('user-1', dto)).rejects.toThrow(ConflictException);
    });
  });

  describe('revoke', () => {
    it('❌ Devrait retourner 404 si le token n\'existe pas', async () => {
      tokensRepo.findOne.mockResolvedValueOnce(null);
      await expect(service.revoke('user-1', 'inconnu')).rejects.toThrow(HttpException);
    });

    it('❌ Devrait retourner 404 si le token appartient à un autre utilisateur', async () => {
      tokensRepo.findOne.mockResolvedValueOnce({
        id: 'dt-1',
        userId: 'user-2',
        token: dto.token,
      });
      await expect(service.revoke('user-1', dto.token)).rejects.toThrow(HttpException);
    });

    it('✅ Devrait révoquer logiquement (revokedAt)', async () => {
      tokensRepo.findOne.mockResolvedValueOnce({
        id: 'dt-1',
        userId: 'user-1',
        token: dto.token,
        revokedAt: null,
      });
      await service.revoke('user-1', dto.token);
      expect(tokensRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });
  });

  describe('getActiveTokens', () => {
    it('✅ Devrait renvoyer uniquement les tokens non révoqués', async () => {
      tokensRepo.find.mockResolvedValueOnce([{ token: 'tok-1' }, { token: 'tok-2' }]);
      await expect(service.getActiveTokens('user-1')).resolves.toEqual(['tok-1', 'tok-2']);
      expect(tokensRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: 'user-1', revokedAt: expect.anything() } }),
      );
    });
  });
});
