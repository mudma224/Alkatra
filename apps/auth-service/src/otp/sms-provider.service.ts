import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';

@Injectable()
export class SmsProviderService {
  private readonly logger = new Logger(SmsProviderService.name);
  private readonly isDevelopment: boolean;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.isDevelopment =
      this.configService.get<string>('NODE_ENV') !== 'production';
  }

  private maskPhone(phone: string): string {
    return phone.length > 6
      ? `${phone.slice(0, 6)}****${phone.slice(-3)}`
      : phone;
  }

  async sendOtp(phone: string, code: string): Promise<void> {
    if (this.isDevelopment) {
      this.logger.log(`[DEV-OTP] Code pour ${phone} : ${code}`);
      return;
    }

    const apiKey = this.configService.get<string>('infobip.apiKey');
    const baseUrl = this.configService.get<string>('infobip.baseUrl');
    const sender = this.configService.get<string>('infobip.sender');

    const payload = {
      messages: [
        {
          destinations: [{ to: phone.replace('+', '') }],
          from: sender,
          text: `Al Katra Bel Qatra : votre code de vérification est ${code}. Valable 5 minutes.`,
        },
      ],
    };

    try {
      await firstValueFrom(
        this.httpService.post(`${baseUrl}/sms/2/text/advanced`, payload, {
          headers: {
            Authorization: `App ${apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }),
      );
      this.logger.log(`OTP SMS envoyé à ${this.maskPhone(phone)}`);
    } catch (error) {
      const axiosError = error as AxiosError;
      this.logger.error(
        `Échec envoi SMS Infobip pour ${this.maskPhone(phone)} : ${axiosError.message}`,
        axiosError.stack,
      );
      throw new InternalServerErrorException(
        "Impossible d'envoyer le code de vérification pour le moment. Veuillez réessayer.",
      );
    }
  }
}