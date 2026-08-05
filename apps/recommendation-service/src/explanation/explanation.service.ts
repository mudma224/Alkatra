import { Injectable } from '@nestjs/common';
import { ShapFactor } from '../entities/recommendation.entity';
import {
  FEATURE_TO_REASON,
  LOW_CONFIDENCE_SUFFIX,
  REASON_CODES,
  ReasonCode,
  TEMPLATES_IRRIGATE,
  TEMPLATES_NO_IRRIGATE,
} from './explanation.templates';

export interface ExplanationResult {
  reasonCode: ReasonCode;
  fr: string;
  darija: string;
}

const LOW_CONFIDENCE_THRESHOLD = 0.5;

@Injectable()
export class ExplanationService {
  /**
   * Génère les textes FR/Darija à partir du facteur SHAP dominant.
   * Appelé une seule fois, au moment de l'insertion PostgreSQL.
   */
  build(params: {
    irrigate: boolean;
    quantityMm: number | null;
    confidenceScore: number | null;
    topFactors: ShapFactor[] | null;
  }): ExplanationResult {
    const { irrigate, quantityMm, confidenceScore, topFactors } = params;

    const reasonCode = this.resolveReasonCode(irrigate, topFactors);
    const templates = irrigate ? TEMPLATES_IRRIGATE : TEMPLATES_NO_IRRIGATE;
    const tpl = templates[reasonCode] ?? templates[REASON_CODES.GENERIC];

    const qty = this.formatQuantity(quantityMm);
    let fr = tpl.fr.replace('{qty}', qty);
    let darija = tpl.darija.replace('{qty}', qty);

    if (confidenceScore !== null && confidenceScore < LOW_CONFIDENCE_THRESHOLD) {
      fr += LOW_CONFIDENCE_SUFFIX.fr;
      darija += LOW_CONFIDENCE_SUFFIX.darija;
    }

    return { reasonCode, fr, darija };
  }

  /** Facteur SHAP de plus forte contribution absolue → reason_code */
  private resolveReasonCode(
    irrigate: boolean,
    topFactors: ShapFactor[] | null,
  ): ReasonCode {
    if (!topFactors?.length) return REASON_CODES.GENERIC;

    const dominant = [...topFactors].sort(
      (a, b) => Math.abs(b.contribution) - Math.abs(a.contribution),
    )[0];

    const mapping = FEATURE_TO_REASON[dominant.feature];
    if (!mapping) return REASON_CODES.GENERIC;

    return irrigate ? mapping.irrigate : mapping.noIrrigate;
  }

  private formatQuantity(quantityMm: number | null): string {
    if (quantityMm === null || Number.isNaN(quantityMm)) return '0';
    return Number.isInteger(quantityMm)
      ? String(quantityMm)
      : quantityMm.toFixed(1);
  }
}