import { BarChart3 } from 'lucide-react';

import styles from './RecommendationTabs.module.css';

export type RecommendationTab = 'details' | 'history';

export interface RecommendationTabsProps {
  activeTab: RecommendationTab;
  onChange: (tab: RecommendationTab) => void;
}

/** Accessible two-tab switch matching the supplied details/history design. */
export function RecommendationTabs({
  activeTab,
  onChange,
}: RecommendationTabsProps) {
  return (
    <div className={styles.tabs} role="tablist" aria-label="Contenu de la recommandation">
      <button
        id="recommendation-details-tab"
        type="button"
        role="tab"
        aria-selected={activeTab === 'details'}
        aria-controls="recommendation-details-panel"
        className={`${styles.tab} ${activeTab === 'details' ? styles.active : ''}`}
        onClick={() => onChange('details')}
      >
        Détails
      </button>

      <button
        id="recommendation-history-tab"
        type="button"
        role="tab"
        aria-selected={activeTab === 'history'}
        aria-controls="recommendation-history-panel"
        className={`${styles.tab} ${activeTab === 'history' ? styles.active : ''}`}
        onClick={() => onChange('history')}
      >
        Historique
        <BarChart3 aria-hidden="true" />
      </button>
    </div>
  );
}
