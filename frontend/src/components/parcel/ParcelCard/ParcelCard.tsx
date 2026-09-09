import { ChevronRight } from 'lucide-react';

import {
  CROP_TYPE_LABELS,
  IRRIGATION_METHOD_LABELS,
} from '../../../types/parcel.types';
import type { Parcel } from '../../../types/parcel.types';
import { formatAreaHa } from '../../../utils/format';

import styles from './ParcelCard.module.css';

export interface ParcelCardProps {
  parcel: Parcel;
  onClick?: (parcel: Parcel) => void;
}

/**
 * Card résumé d'une parcelle — maquettes « FarmDetail - Parcels Populated ».
 *
 * Nom (18/600), « Culture · Méthode d'irrigation » en gris, badge surface
 * à gauche et pill capteur à droite : « ● Capteur » (1), « ● N capteurs »
 * (plusieurs) ou « Sans capteur ». L'état détaillé (actif/en attente/inactif)
 * est visible sur le détail et la liste dédiée.
 */
export function ParcelCard({ parcel, onClick }: ParcelCardProps) {
  const sensorCount = (parcel.sensors ?? []).length;

  return (
    <button type="button" className={styles.card} onClick={() => onClick?.(parcel)}>
      <span className={styles.name}>{parcel.name}</span>
      <span className={styles.subtitle}>
        {CROP_TYPE_LABELS[parcel.cropType]} · {IRRIGATION_METHOD_LABELS[parcel.irrigationMethod]}
      </span>

      <span className={styles.badgesRow}>
        <span className={styles.badge}>{formatAreaHa(parcel.areaHa)} ha</span>

        {sensorCount > 0 ? (
          <span className={styles.sensorBadge}>
            <span className={styles.sensorDot} aria-hidden="true" />
            {sensorCount === 1 ? 'Capteur' : `${sensorCount} capteurs`}
          </span>
        ) : (
          <span className={styles.noSensorBadge}>Sans capteur</span>
        )}
      </span>

      <ChevronRight className={styles.chevron} aria-hidden="true" />
    </button>
  );
}
