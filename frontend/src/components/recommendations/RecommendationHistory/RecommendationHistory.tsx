import { Droplets } from 'lucide-react';

import type { Recommendation } from '../../../types/recommendation.types';

import styles from './RecommendationHistory.module.css';

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const quantityFormatter = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 2,
});

export interface RecommendationHistoryProps {
  recommendations: Recommendation[];
}

/** Renders history items already ordered newest-first by the backend. */
export function RecommendationHistory({
  recommendations,
}: RecommendationHistoryProps) {
  return (
    <section className={styles.section} aria-labelledby="history-title">
      <h2 id="history-title" className={styles.sectionTitle}>
        7 dernières recommandations
      </h2>

      {recommendations.length === 0 ? (
        <p className={styles.empty}>Aucun historique disponible.</p>
      ) : (
        <ul className={styles.list}>
          {recommendations.map((recommendation) => (
            <li className={styles.item} key={recommendation.id}>
              <div>
                <time
                  className={styles.date}
                  dateTime={recommendation.generatedAt}
                >
                  {dateFormatter.format(new Date(recommendation.generatedAt))}
                </time>
                <p className={styles.result}>
                  {recommendation.irrigate
                    ? recommendation.quantityMm === null
                      ? 'Irrigation recommandée'
                      : `${quantityFormatter.format(recommendation.quantityMm)} mm`
                    : "Pas d'irrigation"}
                </p>
              </div>

              <span className={styles.icon} aria-hidden="true">
                <Droplets />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
