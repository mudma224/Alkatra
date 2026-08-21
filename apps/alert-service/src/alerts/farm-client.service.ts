import { HttpService } from '@nestjs/axios';
import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';

export interface ParcelOwner {
  parcelId: string;
  farmId: string;
  ownerId: string;
}

enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Client HTTP vers les endpoints internes de farm-service — utilisé pour
 * résoudre une parcelle vers son propriétaire (flux Kafka des recommandations,
 * sans contexte utilisateur JWT).
 *
 * Circuit breaker maison (même pattern que recommendation-service) : si
 * farm-service est down, rejette immédiatement après 5 échecs consécutifs
 * pendant 30 s. Un 404 (parcelle inconnue) est une réponse métier, pas une
 * indisponibilité : il renvoie null sans compter pour le breaker.
 */
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
   * Résout le propriétaire d'une parcelle, ou null si la parcelle n'existe pas.
   * Lève ServiceUnavailableException si farm-service est injoignable.
   */
  async getParcelOwner(parcelId: string): Promise<ParcelOwner | null> {
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
    const internalToken = this.config.get<string>('app.internalToken');

    try {
      const response = await firstValueFrom(
        this.http.get<ParcelOwner>(`${baseUrl}/internal/parcels/${parcelId}/owner`, {
          headers: internalToken ? { 'X-Internal-Token': internalToken } : {},
          timeout,
        }),
      );

      this.onSuccess();
      return response.data;
    } catch (err) {
      const axiosErr = err as AxiosError;

      if (axiosErr.response?.status === 404) {
        // Parcelle inconnue : réponse métier, pas une indisponibilité.
        return null;
      }

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
