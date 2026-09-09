"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const config_1 = require("@nestjs/config");
const otp_service_1 = require("../src/otp/otp.service");
const redis_provider_1 = require("../src/otp/redis.provider");
describe('OtpService', () => {
    let service;
    let redisMock;
    beforeEach(async () => {
        redisMock = {
            set: jest.fn().mockResolvedValue('OK'),
            get: jest.fn(),
            del: jest.fn().mockResolvedValue(1),
            incr: jest.fn().mockResolvedValue(1),
            expire: jest.fn().mockResolvedValue(1),
        };
        const configMock = {
            get: jest.fn((key) => {
                const values = {
                    'otp.ttlSeconds': 300,
                    'otp.maxAttempts': 3,
                    'otp.blockDurationSeconds': 1800,
                };
                return values[key];
            }),
        };
        const module = await testing_1.Test.createTestingModule({
            providers: [
                otp_service_1.OtpService,
                { provide: redis_provider_1.REDIS_CLIENT, useValue: redisMock },
                { provide: config_1.ConfigService, useValue: configMock },
            ],
        }).compile();
        service = module.get(otp_service_1.OtpService);
    });
    afterEach(() => {
        jest.clearAllMocks();
    });
    describe('generateAndStore', () => {
        it('devrait générer un code de 6 chiffres et le stocker avec le bon TTL', async () => {
            const code = await service.generateAndStore('+212612345678');
            expect(code).toMatch(/^\d{6}$/);
            expect(redisMock.set).toHaveBeenCalledWith('otp:+212612345678', code, 'EX', 300);
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
            expect(redisMock.set).toHaveBeenCalledWith('otp:blocked:+212612345678', '1', 'EX', 1800);
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
//# sourceMappingURL=otp.service.spec.js.map