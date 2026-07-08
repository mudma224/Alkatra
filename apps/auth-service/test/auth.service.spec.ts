import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthService } from '../src/auth/auth.service';
import { UserEntity } from '../src/auth/entities/user.entity';
import { OtpService } from '../src/otp/otp.service';
import { SmsProviderService } from '../src/otp/sms-provider.service';

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: jest.Mocked<Repository<UserEntity>>;
  let otpService: jest.Mocked<OtpService>;
  let smsProviderService: jest.Mocked<SmsProviderService>;
  let jwtService: jest.Mocked<JwtService>;

  const mockUser: UserEntity = {
    id: 'uuid-1',
    phone: '+212612345678',
    name: null,
    preferredLanguage: 'fr',
    otpAttempts: 0,
    otpBlockedUntil: null,
    lastLoginAt: null,
    keycloakId: null,
    createdAt: new Date('2026-06-28T11:18:00Z'),
    updatedAt: new Date('2026-06-28T11:18:00Z'),
  };

  beforeEach(async () => {
    const configMock = {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          'jwt.secret': 'access-secret',
          'jwt.refreshSecret': 'refresh-secret',
          'jwt.accessExpiration': 3600,
          'jwt.refreshExpiration': 2592000,
          'otp.ttlSeconds': 300,
        };
        return values[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(UserEntity),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: OtpService,
          useValue: {
            generateAndStore: jest.fn(),
            isBlocked: jest.fn(),
            verify: jest.fn(),
          },
        },
        {
          provide: SmsProviderService,
          useValue: { sendOtp: jest.fn() },
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn(), verify: jest.fn() },
        },
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepository = module.get(getRepositoryToken(UserEntity));
    otpService = module.get(OtpService);
    smsProviderService = module.get(SmsProviderService);
    jwtService = module.get(JwtService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('requestOtp', () => {
    it('devrait générer un OTP et l’envoyer par SMS', async () => {
      otpService.generateAndStore.mockResolvedValue('123456');

      await service.requestOtp('+212612345678');

      expect(otpService.generateAndStore).toHaveBeenCalledWith('+212612345678');
      expect(smsProviderService.sendOtp).toHaveBeenCalledWith(
        '+212612345678',
        '123456',
      );
    });
  });

  describe('verifyOtpAndAuthenticate', () => {
    it('devrait rejeter si le numéro est bloqué', async () => {
      otpService.isBlocked.mockResolvedValue(true);

      await expect(
        service.verifyOtpAndAuthenticate('+212612345678', '123456'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('devrait rejeter si le code OTP est invalide', async () => {
      otpService.isBlocked.mockResolvedValue(false);
      otpService.verify.mockResolvedValue(false);

      await expect(
        service.verifyOtpAndAuthenticate('+212612345678', '000000'),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('devrait créer un nouvel utilisateur si le téléphone est inconnu', async () => {
      otpService.isBlocked.mockResolvedValue(false);
      otpService.verify.mockResolvedValue(true);
      userRepository.findOne.mockResolvedValue(null);
      userRepository.create.mockReturnValue(mockUser);
      userRepository.save.mockResolvedValue(mockUser);
      jwtService.sign.mockReturnValueOnce('access-token');
      jwtService.sign.mockReturnValueOnce('refresh-token');

      const result = await service.verifyOtpAndAuthenticate(
        '+212612345678',
        '123456',
      );

      expect(userRepository.create).toHaveBeenCalledWith({
        phone: '+212612345678',
      });
      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('refresh-token');
      expect(result.user.phone).toBe('+212612345678');
    });

    it('ne devrait pas recréer un utilisateur existant', async () => {
      otpService.isBlocked.mockResolvedValue(false);
      otpService.verify.mockResolvedValue(true);
      userRepository.findOne.mockResolvedValue(mockUser);
      userRepository.save.mockResolvedValue(mockUser);
      jwtService.sign.mockReturnValue('some-token');

      await service.verifyOtpAndAuthenticate('+212612345678', '123456');

      expect(userRepository.create).not.toHaveBeenCalled();
    });
  });

  describe('generateTokenPair', () => {
    it('devrait signer access et refresh token avec des secrets différents', () => {
      jwtService.sign.mockReturnValueOnce('access-token');
      jwtService.sign.mockReturnValueOnce('refresh-token');

      const result = service.generateTokenPair(mockUser);

      expect(jwtService.sign).toHaveBeenNthCalledWith(
        1,
        { sub: mockUser.id, phone: mockUser.phone },
        expect.objectContaining({ secret: 'access-secret', expiresIn: 3600 }),
      );
      expect(jwtService.sign).toHaveBeenNthCalledWith(
        2,
        { sub: mockUser.id, phone: mockUser.phone },
        expect.objectContaining({ secret: 'refresh-secret', expiresIn: 2592000 }),
      );
      expect(result.tokenType).toBe('Bearer');
    });
  });

  describe('verifyRefreshToken', () => {
    it('devrait retourner le payload si le token est valide', () => {
      jwtService.verify.mockReturnValue({ sub: 'uuid-1', phone: '+212612345678' });

      const payload = service.verifyRefreshToken('valid-token');

      expect(payload.sub).toBe('uuid-1');
    });

    it('devrait lever UnauthorizedException si le token est invalide', () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('jwt expired');
      });

      expect(() => service.verifyRefreshToken('expired-token')).toThrow(
        UnauthorizedException,
      );
    });
  });
});