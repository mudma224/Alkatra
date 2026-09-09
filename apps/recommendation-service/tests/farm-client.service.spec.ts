import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { AxiosResponse, AxiosError } from 'axios';
import { of, throwError } from 'rxjs';
import { FarmClientService } from '../src/recommendations/farm-client.service';

describe('FarmClientService', () => {
  let service: FarmClientService;
  let httpService: jest.Mocked<HttpService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FarmClientService,
        {
          provide: HttpService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'app.farmService.url') return 'http://farm-service:3002';
              if (key === 'app.farmService.timeoutMs') return 5000;
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(FarmClientService);
    httpService = module.get(HttpService);
  });

  it('passe si le farm-service répond 200', async () => {
    httpService.get.mockReturnValue(
      of({ status: 200, data: {} } as AxiosResponse),
    );

    await expect(
      service.assertParcelOwnership('parcel-uuid', 'Bearer token'),
    ).resolves.toBeUndefined();
  });

  it('lève ForbiddenException si le farm-service répond 403', async () => {
    const axiosError = new AxiosError('Forbidden', '403');
    axiosError.response = { status: 403, data: {} } as any;
    httpService.get.mockReturnValue(throwError(() => axiosError));

    await expect(
      service.assertParcelOwnership('parcel-uuid', 'Bearer token'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lève ForbiddenException si le farm-service répond 404', async () => {
    const axiosError = new AxiosError('Not Found', '404');
    axiosError.response = { status: 404, data: {} } as any;
    httpService.get.mockReturnValue(throwError(() => axiosError));

    await expect(
      service.assertParcelOwnership('parcel-uuid', 'Bearer token'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('lève ServiceUnavailableException si le farm-service est injoignable', async () => {
    const axiosError = new AxiosError('Connection refused');
    httpService.get.mockReturnValue(throwError(() => axiosError));

    await expect(
      service.assertParcelOwnership('parcel-uuid', 'Bearer token'),
    ).rejects.toThrow(ServiceUnavailableException);
  });

  describe('Circuit breaker', () => {
    it('ouvre le circuit après 5 échecs consécutifs', async () => {
      const axiosError = new AxiosError('Connection refused');
      httpService.get.mockReturnValue(throwError(() => axiosError));

      // 5 échecs consécutifs
      for (let i = 0; i < 5; i++) {
        await expect(
          service.assertParcelOwnership('parcel-uuid', 'Bearer token'),
        ).rejects.toThrow(ServiceUnavailableException);
      }

      // Le 6e appel doit échouer immédiatement (circuit ouvert)
      // sans appeler le farm-service
      httpService.get.mockClear();
      await expect(
        service.assertParcelOwnership('parcel-uuid', 'Bearer token'),
      ).rejects.toThrow(ServiceUnavailableException);
      expect(httpService.get).not.toHaveBeenCalled();
    });

    it('réinitialise le circuit après un succès', async () => {
      // Forcer 3 échecs
      const axiosError = new AxiosError('Connection refused');
      httpService.get.mockReturnValue(throwError(() => axiosError));
      for (let i = 0; i < 3; i++) {
        await service.assertParcelOwnership('parcel-uuid', 'Bearer token').catch(() => {});
      }

      // Un succès doit réinitialiser le compteur
      httpService.get.mockReturnValue(
        of({ status: 200, data: {} } as AxiosResponse),
      );
      await service.assertParcelOwnership('parcel-uuid', 'Bearer token');

      // Après le succès, 3 échecs ne doivent pas ouvrir le circuit
      httpService.get.mockReturnValue(throwError(() => axiosError));
      for (let i = 0; i < 3; i++) {
        await service.assertParcelOwnership('parcel-uuid', 'Bearer token').catch(() => {});
      }

      // Le 4e appel doit encore appeler le farm-service (circuit toujours fermé)
      httpService.get.mockClear();
      httpService.get.mockReturnValue(throwError(() => axiosError));
      await service.assertParcelOwnership('parcel-uuid', 'Bearer token').catch(() => {});
      expect(httpService.get).toHaveBeenCalled();
    });
  });
});