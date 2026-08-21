import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { ServiceUnavailableException } from '@nestjs/common';
import { AxiosError, AxiosResponse } from 'axios';
import { of, throwError } from 'rxjs';

import { FarmClientService } from '../src/alerts/farm-client.service';

describe('FarmClientService', () => {
  let service: FarmClientService;
  let httpService: { get: jest.Mock };
  let config: { get: jest.Mock };

  const axiosResponse = (data: unknown): AxiosResponse =>
    ({ data, status: 200, statusText: 'OK', headers: {}, config: {} }) as AxiosResponse;

  const axiosError = (status?: number): AxiosError =>
    ({
      isAxiosError: true,
      response: status ? { status, data: {} } : undefined,
      message: status ? `Request failed with status ${status}` : 'ECONNREFUSED',
    }) as AxiosError;

  beforeEach(async () => {
    httpService = { get: jest.fn() };
    config = {
      get: jest.fn((key: string) => {
        if (key === 'app.farmService.url') return 'http://farm-service:3003';
        if (key === 'app.farmService.timeoutMs') return 5000;
        if (key === 'app.internalToken') return 'secret-internal';
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FarmClientService,
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();

    service = module.get<FarmClientService>(FarmClientService);
  });

  it('✅ Devrait résoudre le propriétaire avec le header X-Internal-Token', async () => {
    const owner = { parcelId: 'p1', farmId: 'f1', ownerId: 'user-1' };
    httpService.get.mockReturnValueOnce(of(axiosResponse(owner)));

    await expect(service.getParcelOwner('p1')).resolves.toEqual(owner);
    expect(httpService.get).toHaveBeenCalledWith(
      'http://farm-service:3003/internal/parcels/p1/owner',
      { headers: { 'X-Internal-Token': 'secret-internal' }, timeout: 5000 },
    );
  });

  it('✅ Devrait renvoyer null (sans compter pour le breaker) sur 404', async () => {
    httpService.get.mockReturnValueOnce(throwError(() => axiosError(404)));

    await expect(service.getParcelOwner('inconnu')).resolves.toBeNull();
    expect(service.getCircuitState()).toBe('CLOSED');
  });

  it('❌ Devrait lever ServiceUnavailable sur erreur réseau et compter pour le breaker', async () => {
    httpService.get.mockReturnValue(throwError(() => axiosError()));

    await expect(service.getParcelOwner('p1')).rejects.toThrow(ServiceUnavailableException);
    expect(service.getCircuitState()).toBe('CLOSED'); // 1 échec < seuil 5
  });

  it('❌ Devrait ouvrir le circuit après 5 échecs consécutifs puis rejeter immédiatement', async () => {
    httpService.get.mockReturnValue(throwError(() => axiosError()));

    for (let i = 0; i < 5; i++) {
      await expect(service.getParcelOwner('p1')).rejects.toThrow(ServiceUnavailableException);
    }
    expect(service.getCircuitState()).toBe('OPEN');

    // Circuit ouvert : plus aucun appel HTTP partant.
    const callsBefore = httpService.get.mock.calls.length;
    await expect(service.getParcelOwner('p1')).rejects.toThrow(ServiceUnavailableException);
    expect(httpService.get.mock.calls.length).toBe(callsBefore);
  });

  it('✅ Devrait refermer le circuit après un succès post-reset', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-21T10:00:00Z'));
    try {
      httpService.get.mockReturnValue(throwError(() => axiosError()));
      for (let i = 0; i < 5; i++) {
        await expect(service.getParcelOwner('p1')).rejects.toThrow(ServiceUnavailableException);
      }
      expect(service.getCircuitState()).toBe('OPEN');

      // Au-delà du timeout de reset (30 s), le prochain appel est un test HALF_OPEN.
      jest.setSystemTime(new Date('2026-08-21T10:00:31Z'));
      httpService.get.mockReturnValueOnce(
        of(axiosResponse({ parcelId: 'p1', farmId: 'f1', ownerId: 'user-1' })),
      );

      await expect(service.getParcelOwner('p1')).resolves.toEqual({
        parcelId: 'p1',
        farmId: 'f1',
        ownerId: 'user-1',
      });
      expect(service.getCircuitState()).toBe('CLOSED');
    } finally {
      jest.useRealTimers();
    }
  });
});
