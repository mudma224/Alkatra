import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthController } from '../src/health/health.controller';

// Mock axios
jest.mock('axios', () => ({
  get: jest.fn(),
}));

import axios from 'axios';

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('HealthController', () => {
  let controller: HealthController;

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
      controllers: [HealthController],
      providers: [
        { provide: ConfigService, useValue: configMock },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
    jest.clearAllMocks();
  });

  describe('liveness', () => {
    it('devrait retourner alive avec le nom du service', () => {
      const result = controller.liveness();

      expect(result).toMatchObject({
        status: 'alive',
        service: 'user-service',
      });
      expect(result).toHaveProperty('timestamp');
    });
  });

  describe('readiness', () => {
    it('devrait retourner ready si auth-service répond', async () => {
      mockedAxios.get.mockResolvedValue({ data: { status: 'ok' } });

      const result = await controller.readiness();

      expect(mockedAxios.get).toHaveBeenCalledWith('http://localhost:3001/health');
      expect(result).toMatchObject({
        status: 'ready',
        checks: { authService: 'up' },
      });
    });

    it('devrait lever ServiceUnavailableException si auth-service est injoignable', async () => {
      mockedAxios.get.mockRejectedValue(new Error('connection refused'));

      await expect(controller.readiness()).rejects.toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('check', () => {
    it('devrait déléguer à readiness', async () => {
      mockedAxios.get.mockResolvedValue({ data: { status: 'ok' } });

      const result = await controller.check();

      expect(mockedAxios.get).toHaveBeenCalledWith('http://localhost:3001/health');
      expect(result.status).toBe('ready');
    });
  });
});