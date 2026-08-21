import type { AlertData } from '../../database/entities/alert.entity';

/**
 * Payload minimal requis par la règle — aligné sur le message Kafka
 * `recommendations-generated` produit par ml-inference-service.
 */
export interface RecommendationLikePayload {
  parcel_id: string;
  should_irrigate: boolean;
  irrigation_probability: number;
  /** Optionnel dans le message Kafka : sans lui, la règle ne peut pas
   * trancher sur la sécheresse et ne déclenche pas (défaut sûr). */
  soil_humidity_pct?: number;
}

export interface HydricStressRuleConfig {
  probabilityThreshold: number;
  soilHumidityMaxPct: number;
}

export interface HydricStressEvaluation {
  triggered: boolean;
  /** Contexte stocké dans alerts.data quand la règle déclenche. */
  data: AlertData;
}

/**
 * Règle pure de détection du stress hydrique critique sur une recommandation.
 *
 * La politique de seuil (probability ≥ 0,75 ET humidité du sol ≤ 25 % par
 * défaut) est une décision de NOTIFICATION, pas de ML : le modèle produit la
 * probabilité, ce service décide s'il faut alerter le fermier.
 */
export class HydricStressRule {
  static readonly DEFAULT_CONFIG: HydricStressRuleConfig = {
    probabilityThreshold: 0.75,
    soilHumidityMaxPct: 25,
  };

  static evaluate(
    payload: RecommendationLikePayload,
    config: HydricStressRuleConfig = HydricStressRule.DEFAULT_CONFIG,
  ): HydricStressEvaluation {
    const data: AlertData = {
      irrigationProbability: payload.irrigation_probability,
    };
    if (payload.soil_humidity_pct !== undefined) {
      data.soilHumidityPct = payload.soil_humidity_pct;
    }

    const triggered =
      payload.should_irrigate === true &&
      typeof payload.irrigation_probability === 'number' &&
      payload.irrigation_probability >= config.probabilityThreshold &&
      typeof payload.soil_humidity_pct === 'number' &&
      payload.soil_humidity_pct <= config.soilHumidityMaxPct;

    return { triggered, data };
  }
}
