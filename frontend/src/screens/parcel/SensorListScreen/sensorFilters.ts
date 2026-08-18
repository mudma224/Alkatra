import { getSensorStatus } from '../../../types/parcel.types';
import type { Sensor, SensorStatus } from '../../../types/parcel.types';
import { normalizeSearch } from '../../../utils/format';

/** Ordre d'affichage : actifs d'abord, puis en attente, puis inactifs. */
const STATUS_ORDER: Record<SensorStatus, number> = {
  active: 0,
  pending: 1,
  inactive: 2,
};

/**
 * Comparateur de tri des capteurs (maquette SensorList) : actifs d'abord,
 * puis jamais vus, puis silencieux ; à statut égal, ordre alphabétique
 * insensible à la casse et aux diacritiques sur le deviceId.
 */
export function normalizeSearchOrder(a: Sensor, b: Sensor): number {
  const statusDiff = STATUS_ORDER[getSensorStatus(a)] - STATUS_ORDER[getSensorStatus(b)];
  if (statusDiff !== 0) {
    return statusDiff;
  }

  return normalizeSearch(a.deviceId).localeCompare(normalizeSearch(b.deviceId));
}
