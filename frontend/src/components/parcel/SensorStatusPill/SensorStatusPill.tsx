import { getSensorStatus } from '../../../types/parcel.types';
import type { Sensor } from '../../../types/parcel.types';

import styles from './SensorStatusPill.module.css';

const STATUS_LABELS = {
  active: 'Actif',
  pending: 'En attente',
  inactive: 'Inactif',
} as const;

export interface SensorStatusPillProps {
  sensor: Sensor;
}

/**
 * Pill de statut d'un capteur — maquettes « ParcelDetail - Multi Sensors »
 * et « SensorList - Populated » : ● Actif (vert), ○ En attente (creux, gris,
 * jamais vu), ● Inactif (gris plein, silence > 48 h).
 */
export function SensorStatusPill({ sensor }: SensorStatusPillProps) {
  const status = getSensorStatus(sensor);

  return (
    <span className={status === 'active' ? styles.active : styles.inactive}>
      <span
        className={
          status === 'active' ? styles.dotActive : status === 'pending' ? styles.dotPending : styles.dotInactive
        }
        aria-hidden="true"
      />
      {STATUS_LABELS[status]}
    </span>
  );
}
