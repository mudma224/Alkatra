import { getSensorStatus } from '../../../types/parcel.types';
import type { Sensor, SensorStatus } from '../../../types/parcel.types';

import styles from './SensorStatusPill.module.css';

const STATUS_LABELS: Record<SensorStatus, string> = {
  active: 'Actif',
  pending: 'En attente',
  inactive: 'Désactivé',
  failing: 'Défaillant',
};

const PILL_CLASS: Record<SensorStatus, string> = {
  active: styles.active,
  pending: styles.pending,
  inactive: styles.inactive,
  failing: styles.failing,
};

const DOT_CLASS: Record<SensorStatus, string> = {
  active: styles.dotActive,
  pending: styles.dotPending,
  inactive: styles.dotInactive,
  failing: styles.dotFailing,
};

export interface SensorStatusPillProps {
  sensor: Sensor;
}

/**
 * Pill de statut d'un capteur — maquettes « ParcelDetail - Multi Sensors »
 * et « SensorList - Populated » : ● Actif (vert), ○ En attente (creux, gris,
 * jamais vu), ● Désactivé (gris plein, silence > 2 h), ● Défaillant (rouge,
 * silence > 24 h — seuils configurables côté farm-service).
 */
export function SensorStatusPill({ sensor }: SensorStatusPillProps) {
  const status = getSensorStatus(sensor);

  return (
    <span className={PILL_CLASS[status]}>
      <span className={DOT_CLASS[status]} aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}
