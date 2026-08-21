import { Bot, Droplets } from 'lucide-react';

import { Button } from '../../ui/Button/Button';
import type { Recommendation } from '../../../types/recommendation.types';

import styles from './RecommendationSummary.module.css';

const quantityFormatter = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 2,
});

export interface RecommendationSummaryProps {
  recommendation: Recommendation;
  explanation: string;
  explanationLanguage: 'fr' | 'darija';
  onFeedback: () => void;
}

/**
 * Presentational summary of today's backend recommendation.
 * It never calculates irrigation values; it only formats fields already returned by the API.
 */
export function RecommendationSummary({
  recommendation,
  explanation,
  explanationLanguage,
  onFeedback,
}: RecommendationSummaryProps) {
  const feedbackLocked =
    recommendation.userFeedback !== null ||
    recommendation.status === 'executed' ||
    recommendation.status === 'expired';

  return (
    <article className={styles.card} aria-labelledby="recommendation-title">
      <div className={styles.headerRow}>
        <div>
          <h2 id="recommendation-title" className={styles.title}>
            {recommendation.irrigate
              ? 'Irrigation recommandée'
              : 'Aucune irrigation recommandée'}
          </h2>

          {recommendation.irrigate && (
            <p className={styles.quantity}>
              {recommendation.quantityMm === null
                ? 'Quantité indisponible'
                : `${quantityFormatter.format(recommendation.quantityMm)} mm`}
            </p>
          )}
        </div>

        <span className={styles.irrigationIcon} aria-hidden="true">
          <Droplets />
        </span>
      </div>

      <div className={styles.explanationPanel}>
        <p
          className={styles.explanation}
          lang={explanationLanguage === 'darija' ? 'ary' : 'fr'}
          dir={explanationLanguage === 'darija' ? 'rtl' : 'ltr'}
        >
          {explanation || 'Explication indisponible.'}
        </p>
        <Bot className={styles.botIcon} aria-hidden="true" />
      </div>

      {recommendation.durationMinutes !== null && (
        <p className={styles.duration}>
          Durée estimée&nbsp;: {recommendation.durationMinutes} min
        </p>
      )}

      {recommendation.demoMode && (
        <p className={styles.demoBadge}>Mode démonstration</p>
      )}

      <Button
        variant="secondary"
        block
        disabled={feedbackLocked}
        onClick={onFeedback}
      >
        {feedbackLocked ? 'Avis enregistré' : 'Donner votre avis'}
      </Button>
    </article>
  );
}
