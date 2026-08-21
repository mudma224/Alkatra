import {
  CloudRain,
  CloudSun,
  Droplets,
  Gauge,
  Thermometer,
  Wind,
  type LucideIcon,
} from 'lucide-react';

import type { RecommendationFactor } from '../../../types/recommendation.types';

import styles from './RecommendationFactors.module.css';

const contributionFormatter = new Intl.NumberFormat('fr-FR', {
  maximumFractionDigits: 3,
  signDisplay: 'always',
});

/** Selects a visual icon only; factor meaning and values remain backend-owned. */
function getFactorIcon(feature: string): LucideIcon {
  const normalizedFeature = feature.toLowerCase();

  if (normalizedFeature.includes('temp')) return Thermometer;
  if (normalizedFeature.includes('humid')) return Droplets;
  if (normalizedFeature.includes('pluie')) return CloudRain;
  if (normalizedFeature.includes('vent')) return Wind;
  if (
    normalizedFeature.includes('et0') ||
    normalizedFeature.includes('etc') ||
    normalizedFeature.includes('rayonnement')
  ) {
    return CloudSun;
  }

  return Gauge;
}

export interface RecommendationFactorsProps {
  factors: RecommendationFactor[];
  language?: 'fr' | 'ar';
}

/** Displays the backend SHAP labels and signed contributions without inventing values/units. */
export function RecommendationFactors({
  factors,
  language = 'fr',
}: RecommendationFactorsProps) {
  return (
    <section className={styles.section} aria-labelledby="factors-title">
      <h2 id="factors-title" className={styles.sectionTitle}>
        Facteurs principaux
      </h2>

      {factors.length === 0 ? (
        <p className={styles.empty}>Aucun facteur explicatif disponible.</p>
      ) : (
        <ul className={styles.list}>
          {factors.map((factor) => {
            const Icon = getFactorIcon(factor.feature);

            return (
              <li className={styles.item} key={`${factor.feature}-${factor.contribution}`}>
                <span className={styles.iconWrapper} aria-hidden="true">
                  <Icon />
                </span>

                <span
                  className={styles.label}
                  lang={language === 'ar' ? 'ar' : 'fr'}
                  dir={language === 'ar' ? 'rtl' : 'ltr'}
                >
                  {(language === 'ar' ? factor.label_ar : factor.label_fr) ||
                    factor.feature}
                </span>

                <span className={styles.contribution}>
                  <span className={styles.contributionLabel}>Contribution</span>
                  {contributionFormatter.format(factor.contribution)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
