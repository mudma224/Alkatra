import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { OtpService } from '../src/otp/otp.service';
import { REDIS_CLIENT } from '../src/otp/redis.provider';

describe('OtpService', () => {
  let service: OtpService;
  let redisMock: {
    set: jest.Mock;
    get: jest.Mock;
    del: jest.Mock;
    incr: jest.Mock;
    expire: jest.Mock;
  };

  beforeEach(async () => {
    redisMock = {
      set: jest.fn().mockResolvedValue('OK'),
      get: jest.fn(),
      del: jest.fn().mockResolvedValue(1),
      incr: jest.fn().mockResolvedValue(1),
      expire: jest.fn().mockResolvedValue(1),
    };

    const configMock = {
      get: jest.fn((key: string) => {
        const values: Record<string, number> = {
          'otp.ttlSeconds': 300,
          'otp.maxAttempts': 3,
          'otp.blockDurationSeconds': 1800,
        };
        return values[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OtpService,
        { provide: REDIS_CLIENT, useValue: redisMock },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get<OtpService>(OtpService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateAndStore', () => {
    it('devrait générer un code de 6 chiffres et le stocker avec le bon TTL', async () => {
      const code = await service.generateAndStore('+212612345678');

      expect(code).toMatch(/^\d{6}$/);
      expect(redisMock.set).toHaveBeenCalledWith(
        'otp:+212612345678',
        code,
        'EX',
        300,
      );
    });
  });

  describe('verify', () => {
    it('devrait retourner true si le code correspond', async () => {
      redisMock.get.mockResolvedValue('123456');

      const result = await service.verify('+212612345678', '123456');

      expect(result).toBe(true);
      expect(redisMock.del).toHaveBeenCalled();
    });

    it('devrait retourner false si le code ne correspond pas', async () => {
      redisMock.get.mockResolvedValue('123456');

      const result = await service.verify('+212612345678', '000000');

      expect(result).toBe(false);
      expect(redisMock.incr).toHaveBeenCalled();
    });

    it('devrait bloquer le numéro après le nombre maximum de tentatives échouées', async () => {
      redisMock.get.mockResolvedValue('123456');
      redisMock.incr.mockResolvedValue(3);

      await service.verify('+212612345678', '000000');

      expect(redisMock.set).toHaveBeenCalledWith(
        'otp:blocked:+212612345678',
        '1',
        'EX',
        1800,
      );
    });
  });

  describe('isBlocked', () => {
    it('devrait retourner true si une clé de blocage existe', async () => {
      redisMock.get.mockResolvedValue('1');
      const result = await service.isBlocked('+212612345678');
      expect(result).toBe(true);
    });

    it('devrait retourner false si aucune clé de blocage', async () => {
      redisMock.get.mockResolvedValue(null);
      const result = await service.isBlocked('+212612345678');
      expect(result).toBe(false);
    });
  });
});