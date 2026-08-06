import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtStrategy } from '../src/common/strategies/jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtStrategy,
        { provide: ConfigService, useValue: { get: () => 'test-secret' } },
      ],
    }).compile();

    strategy = module.get(JwtStrategy);
  });

  it('retourne un AuthenticatedUser à partir d’un payload valide', async () => {
    const result = await strategy.validate({
      sub: 'user-123',
      phone: '+212600000000',
    });

    expect(result).toEqual({
      userId: 'user-123',
      phone: '+212600000000',
      authorization: '',
    });
  });

  it('lève UnauthorizedException si sub est manquant', async () => {
    await expect(
      strategy.validate({ sub: '', phone: '+212600000000' }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
