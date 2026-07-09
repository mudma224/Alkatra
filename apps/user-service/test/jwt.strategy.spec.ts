import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from '../src/auth/jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(async () => {
    const configMock = {
      getOrThrow: jest.fn((key: string) => {
        const values: Record<string, string> = {
          JWT_SECRET: 'test-secret-key',
        };
        return values[key];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    strategy = module.get<JwtStrategy>(JwtStrategy);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validate', () => {
    it('devrait retourner un objet avec userId et phone à partir du payload', async () => {
      const payload = {
        sub: 'uuid-user-1',
        phone: '+212612345678',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const result = await strategy.validate(payload);

      expect(result).toEqual({
        userId: payload.sub,
        phone: payload.phone,
      });
    });
  });
});