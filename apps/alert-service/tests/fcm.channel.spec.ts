import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { FcmChannel } from '../src/channels/fcm.channel';
import { DevicesService } from '../src/devices/devices.service';
import { MetricsService } from '../src/metrics/metrics.service';
import { Alert } from '../src/database/entities/alert.entity';

describe('FcmChannel', () => {
  let channel: FcmChannel;
  let config: { get: jest.Mock };
  let devices: { getActiveTokens: jest.Mock; revokeInternal: jest.Mock };
  let metrics: {
    setFcmEnabled: jest.Mock;
    recordFcmSent: jest.Mock;
    recordFcmFailed: jest.Mock;
  };

  const alert = {
    id: 'alert-1',
    userId: 'user-1',
    parcelId: 'parcel-1',
    alertType: 'sensor_offline',
    severity: 'warning',
    title: 'Capteur hors ligne',
    message: 'Le capteur esp32-001 est hors ligne.',
    data: { deviceId: 'esp32-001', batteryPct: 62 },
  } as unknown as Alert;

  beforeEach(async () => {
    config = { get: jest.fn().mockReturnValue('') }; // FIREBASE_* vides par défaut
    devices = {
      getActiveTokens: jest.fn(),
      revokeInternal: jest.fn().mockResolvedValue(undefined),
    };
    metrics = { setFcmEnabled: jest.fn(), recordFcmSent: jest.fn(), recordFcmFailed: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FcmChannel,
        { provide: ConfigService, useValue: config },
        { provide: DevicesService, useValue: devices },
        { provide: MetricsService, useValue: metrics },
      ],
    }).compile();

    channel = module.get<FcmChannel>(FcmChannel);
    channel.onModuleInit();
  });

  it('✅ Devrait rester désactivé (dégradation gracieuse) si FIREBASE_* sont vides', () => {
    expect(channel.isEnabled()).toBe(false);
    expect(metrics.setFcmEnabled).toHaveBeenCalledWith(false);
  });

  it('✅ Devrait répondre disabled sans erreur quand le canal est inactif', async () => {
    await expect(channel.notify(alert)).resolves.toBe('disabled');
    expect(devices.getActiveTokens).not.toHaveBeenCalled();
  });

  describe('canal activé (credentials présents)', () => {
    let messagingMock: {
      sendEachForMulticast: jest.Mock;
    };

    beforeEach(async () => {
      messagingMock = { sendEachForMulticast: jest.fn() };

      config.get.mockImplementation((key: string) => {
        if (key === 'app.firebase.projectId') return 'alkatra-proj';
        if (key === 'app.firebase.clientEmail') return 'svc@alkatra-proj.iam';
        if (key === 'app.firebase.privateKey') return '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----';
        return undefined;
      });

      // Contourner l'initialisation réelle de firebase-admin : injecter le
      // messaging directement plutôt que d'appeler initializeApp.
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          FcmChannel,
          { provide: ConfigService, useValue: config },
          { provide: DevicesService, useValue: devices },
          { provide: MetricsService, useValue: metrics },
        ],
      }).compile();

      channel = module.get<FcmChannel>(FcmChannel);
      // onModuleInit échouerait à initialiser un vrai credential — on teste
      // le chemin "activé" via le messaging injecté.
      (channel as unknown as { messaging: unknown }).messaging = messagingMock;
      (channel as unknown as { onModuleInit: () => void }).onModuleInit = () => undefined;
      // isEnabled lit this.messaging — maintenant non null.
    });

    it('✅ Devrait répondre skipped_no_tokens si aucun device enregistré', async () => {
      devices.getActiveTokens.mockResolvedValueOnce([]);

      await expect(channel.notify(alert)).resolves.toBe('skipped_no_tokens');
      expect(messagingMock.sendEachForMulticast).not.toHaveBeenCalled();
    });

    it('✅ Devrait envoyer le multicast et répondre sent', async () => {
      devices.getActiveTokens.mockResolvedValueOnce(['token-a', 'token-b']);
      messagingMock.sendEachForMulticast.mockResolvedValueOnce({
        successCount: 2,
        failureCount: 0,
        responses: [{ success: true }, { success: true }],
      });

      await expect(channel.notify(alert)).resolves.toBe('sent');
      expect(messagingMock.sendEachForMulticast).toHaveBeenCalledWith(
        expect.objectContaining({
          tokens: ['token-a', 'token-b'],
          notification: { title: 'Capteur hors ligne', body: alert.message },
        }),
      );
      // data FCM : valeurs string uniquement.
      const call = messagingMock.sendEachForMulticast.mock.calls[0][0];
      expect(call.data.deviceId).toBe('esp32-001');
      expect(call.data.batteryPct).toBe('62');
      expect(metrics.recordFcmSent).toHaveBeenCalled();
    });

    it('✅ Devrait révoquer un token mort signalé par FCM', async () => {
      devices.getActiveTokens.mockResolvedValueOnce(['token-mort', 'token-ok']);
      messagingMock.sendEachForMulticast.mockResolvedValueOnce({
        successCount: 1,
        failureCount: 1,
        responses: [
          { success: false, error: { code: 'messaging/registration-token-not-registered' } },
          { success: true },
        ],
      });

      await expect(channel.notify(alert)).resolves.toBe('sent');
      expect(devices.revokeInternal).toHaveBeenCalledWith('token-mort');
    });

    it('❌ Devrait répondre error (sans throw) si tous les envois échouent', async () => {
      devices.getActiveTokens.mockResolvedValueOnce(['token-a']);
      messagingMock.sendEachForMulticast.mockResolvedValueOnce({
        successCount: 0,
        failureCount: 1,
        responses: [{ success: false, error: { code: 'messaging/Quota-exceeded' } }],
      });

      await expect(channel.notify(alert)).resolves.toBe('error');
      expect(metrics.recordFcmFailed).toHaveBeenCalled();
    });

    it('❌ Devrait répondre error (sans throw) si l\'API FCM rejette', async () => {
      devices.getActiveTokens.mockResolvedValueOnce(['token-a']);
      messagingMock.sendEachForMulticast.mockRejectedValueOnce(new Error('network'));

      await expect(channel.notify(alert)).resolves.toBe('error');
      expect(metrics.recordFcmFailed).toHaveBeenCalled();
    });
  });
});
