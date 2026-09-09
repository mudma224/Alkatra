import { SensorStatusPill } from '../SensorStatusPill/SensorStatusPill';
import { formatLastSeen } from '../../../utils/format';
import type { Sensor } from '../../../types/parcel.types';

import styles from './SensorListItem.module.css';

export interface SensorListItemProps {
  sensor: Sensor;
  onDissociate: (sensor: Sensor) => void;
}

/**
 * Ligne capteur complète — maquettes « ParcelDetail - Multi Sensors »
 * (188:28) et « SensorList - Populated » (188:103) : deviceId, lien
 * Dissocier, pill de statut et métadonnées (batterie, dernière activité).
 * Le filet séparateur entre lignes est géré par le CSS du conteneur.
 */
export function SensorListItem({ sensor, onDissociate }: SensorListItemProps) {
  const lastSeen = formatLastSeen(sensor.lastSeenAt);

  return (
    <div className={styles.item}>
      <div className={styles.header}>
        <span className={styles.deviceId}>{sensor.deviceId}</span>
        <button type="button" className={styles.dissociate} onClick={() => onDissociate(sensor)}>
          Dissocier
        </button>
      </div>

      <div className={styles.meta}>
        <SensorStatusPill sensor={sensor} />
        {sensor.batteryPct !== null && sensor.batteryPct !== undefined && (
          <span className={styles.metaText}>Batterie {sensor.batteryPct} %</span>
        )}
        {lastSeen && <span className={styles.metaText}>{lastSeen}</span>}
      </div>
    </div>
  );
}
