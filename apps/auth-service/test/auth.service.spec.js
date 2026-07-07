"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const jwt_1 = require("@nestjs/jwt");
const typeorm_1 = require("@nestjs/typeorm");
const auth_service_1 = require("../src/auth/auth.service");
const user_entity_1 = require("../src/auth/entities/user.entity");
const otp_service_1 = require("../src/otp/otp.service");
const sms_provider_service_1 = require("../src/otp/sms-provider.service");
describe('AuthService', () => {
    let service;
    let userRepository;
    let otpService;
    let smsProviderService;
    let jwtService;
    const mockUser = {
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
            get: jest.fn((key) => {
                const values = {
                    'jwt.secret': 'access-secret',
                    'jwt.refreshSecret': 'refresh-secret',
                    'jwt.accessExpiration': 3600,
                    'jwt.refreshExpiration': 2592000,
                    'otp.ttlSeconds': 300,
                };
                return values[key];
            }),
        };
        const module = await testing_1.Test.createTestingModule({
            providers: [
                auth_service_1.AuthService,
                {
                    provide: (0, typeorm_1.getRepositoryToken)(user_entity_1.UserEntity),
                    useValue: {
                        findOne: jest.fn(),
                        create: jest.fn(),
                        save: jest.fn(),
                    },
                },
                {
                    provide: otp_service_1.OtpService,
                    useValue: {
                        generateAndStore: jest.fn(),
                        isBlocked: jest.fn(),
                        verify: jest.fn(),
                    },
                },
                {
                    provide: sms_provider_service_1.SmsProviderService,
                    useValue: { sendOtp: jest.fn() },
                },
                {
                    provide: jwt_1.JwtService,
                    useValue: { sign: jest.fn(), verify: jest.fn() },
                },
                { provide: config_1.ConfigService, useValue: configMock },
            ],
        }).compile();
        service = module.get(auth_service_1.AuthService);
        userRepository = module.get((0, typeorm_1.getRepositoryToken)(user_entity_1.UserEntity));
        otpService = module.get(otp_service_1.OtpService);
        smsProviderService = module.get(sms_provider_service_1.SmsProviderService);
        jwtService = module.get(jwt_1.JwtService);
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    describe('requestOtp', () => {
        it('devrait générer un OTP et l’envoyer par SMS', async () => {
            otpService.generateAndStore.mockResolvedValue('123456');
            await service.requestOtp('+212612345678');
            expect(otpService.generateAndStore).toHaveBeenCalledWith('+212612345678');
            expect(smsProviderService.sendOtp).toHaveBeenCalledWith('+212612345678', '123456');
        });
    });
    describe('verifyOtpAndAuthenticate', () => {
        it('devrait rejeter si le numéro est bloqué', async () => {
            otpService.isBlocked.mockResolvedValue(true);
            await expect(service.verifyOtpAndAuthenticate('+212612345678', '123456')).rejects.toThrow(common_1.UnauthorizedException);
        });
        it('devrait rejeter si le code OTP est invalide', async () => {
            otpService.isBlocked.mockResolvedValue(false);
            otpService.verify.mockResolvedValue(false);
            await expect(service.verifyOtpAndAuthenticate('+212612345678', '000000')).rejects.toThrow(common_1.UnauthorizedException);
        });
        it('devrait créer un nouvel utilisateur si le téléphone est inconnu', async () => {
            otpService.isBlocked.mockResolvedValue(false);
            otpService.verify.mockResolvedValue(true);
            userRepository.findOne.mockResolvedValue(null);
            userRepository.create.mockReturnValue(mockUser);
            userRepository.save.mockResolvedValue(mockUser);
            jwtService.sign.mockReturnValueOnce('access-token');
            jwtService.sign.mockReturnValueOnce('refresh-token');
            const result = await service.verifyOtpAndAuthenticate('+212612345678', '123456');
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
            expect(jwtService.sign).toHaveBeenNthCalledWith(1, { sub: mockUser.id, phone: mockUser.phone }, expect.objectContaining({ secret: 'access-secret', expiresIn: 3600 }));
            expect(jwtService.sign).toHaveBeenNthCalledWith(2, { sub: mockUser.id, phone: mockUser.phone }, expect.objectContaining({ secret: 'refresh-secret', expiresIn: 2592000 }));
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
            expect(() => service.verifyRefreshToken('expired-token')).toThrow(common_1.UnauthorizedException);
        });
    });
});
//# sourceMappingURL=auth.service.spec.js.map