import { ChevronRight } from 'lucide-react';
import { formatAreaHa, formatRegionLabel } from '../../../utils/format';
import type { Farm } from '../../../types/farm.types';
import styles from './FarmCard.module.css';

export interface FarmCardProps {
  farm: Farm;
  /** Appelé au clic sur la card (navigation vers le détail). */
  onClick?: (farm: Farm) => void;
}

/**
 * Card résumé d'une ferme dans la liste (maquette « FarmList - Populated »,
 * node Figma 76:34 — card 358×100 : nom, région, badge de surface, chevron).
 */
export function FarmCard({ farm, onClick }: FarmCardProps) {
  return (
    <button
      type="button"
      className={styles.card}
      onClick={onClick ? () => onClick(farm) : undefined}
    >
      <span className={styles.name}>{farm.name}</span>
      <span className={styles.region}>
        {farm.region ? formatRegionLabel(farm.region) : 'Région non renseignée'}
      </span>
      <span className={styles.badge}>{formatAreaHa(farm.totalAreaHa)} ha</span>
      <ChevronRight className={styles.chevron} aria-hidden="true" />
    </button>
  );
}
