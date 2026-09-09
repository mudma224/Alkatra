import { HttpService } from '@nestjs/axios';
import {
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

@Injectable()
export class FarmClientService {
  private readonly logger = new Logger(FarmClientService.name);

  private circuitState: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private lastFailureTime = 0;

  private readonly FAILURE_THRESHOLD = 5;
  private readonly RESET_TIMEOUT_MS = 30_000;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Vérifie auprès du farm-service que la parcelle appartient à l'utilisateur.
   * Lève ForbiddenException si non autorisé.
   * Circuit breaker : si le farm-service est down, rejette immédiatement après 5 échecs.
   */
  async assertParcelOwnership(
    parcelId: string,
    authorization: string,
  ): Promise<void> {
    // Vérifier l'état du circuit breaker
    if (this.circuitState === CircuitState.OPEN) {
      const elapsed = Date.now() - this.lastFailureTime;
      if (elapsed > this.RESET_TIMEOUT_MS) {
        this.circuitState = CircuitState.HALF_OPEN;
        this.logger.warn('Circuit breaker → HALF_OPEN (test de récupération)');
      } else {
        throw new ServiceUnavailableException(
          'Service de gestion des parcelles indisponible (circuit ouvert)',
        );
      }
    }

    const baseUrl = this.config.get<string>('app.farmService.url');
    const timeout = this.config.get<number>('app.farmService.timeoutMs');

    try {
      await firstValueFrom(
        this.http.get(`${baseUrl}/api/v1/parcels/${parcelId}`, {
          headers: { Authorization: authorization },
          timeout,
        }),
      );

      // Succès → réinitialiser le circuit breaker
      this.onSuccess();
    } catch (err) {
      const axiosErr = err as AxiosError;
      const status = axiosErr.response?.status;

      if (status === 403 || status === 404) {
        // Erreur métier (pas une indisponibilité) → ne pas compter pour le circuit breaker
        throw new ForbiddenException(
          'Parcelle non accessible pour cet utilisateur',
        );
      }

      // Erreur d'indisponibilité → compter pour le circuit breaker
      this.onFailure();
      this.logger.error(
        `farm-service injoignable : ${axiosErr.message} (échecs consécutifs: ${this.failureCount})`,
      );
      throw new ServiceUnavailableException(
        'Service de gestion des parcelles indisponible',
      );
    }
  }

  private onSuccess(): void {
    if (this.circuitState !== CircuitState.CLOSED) {
      this.logger.log('Circuit breaker → CLOSED (farm-service récupéré)');
    }
    this.failureCount = 0;
    this.circuitState = CircuitState.CLOSED;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.FAILURE_THRESHOLD) {
      this.circuitState = CircuitState.OPEN;
      this.logger.error(
        `Circuit breaker → OPEN (${this.failureCount} échecs consécutifs)`,
      );
    }
  }

  /** Exposé pour les tests et le health check */
  getCircuitState(): CircuitState {
    return this.circuitState;
  }
}