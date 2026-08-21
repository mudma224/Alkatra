/**
 * Types du domaine Parcel — alignés sur le code du farm-service
 * (apps/farm-service/src/database/entities/parcel.entity.ts,
 * sensor.entity.ts + dto/create-parcel.dto.ts, update-parcel.dto.ts,
 * associate-sensor.dto.ts).
 */

import type { Farm, GeoJsonPoint } from './farm.types';

/** `crop_type_enum` — valeurs exactes de la colonne Postgres. */
export type CropType = 'olive' | 'citrus' | 'cereal' | 'vegetable' | 'other';

/** `soil_type_enum`. */
export type SoilType = 'clay' | 'silt' | 'sandy' | 'calcareous' | 'mixed';

/** `irrigation_method_enum`. */
export type IrrigationMethod = 'drip' | 'sprinkler' | 'gravity';

/** Polygone GeoJSON tel que stocké par PostGIS (SRID 4326). Non éditable en Phase 4. */
export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

/** Libellés français des enums (affichés cards, détail et options des selects). */
export const CROP_TYPE_LABELS: Record<CropType, string> = {
  olive: 'Oliviers',
  citrus: 'Agrumes',
  cereal: 'Céréales',
  vegetable: 'Légumes',
  other: 'Autre',
};

export const SOIL_TYPE_LABELS: Record<SoilType, string> = {
  clay: 'Argileux',
  silt: 'Limoneux',
  sandy: 'Sableux',
  calcareous: 'Calcaire',
  mixed: 'Mixte',
};

export const IRRIGATION_METHOD_LABELS: Record<IrrigationMethod, string> = {
  drip: 'Goutte à goutte',
  sprinkler: 'Aspersion',
  gravity: 'Gravitaire',
};

/** Options prêtes à consommer par le composant `Select`. */
export const CROP_TYPE_OPTIONS = (Object.keys(CROP_TYPE_LABELS) as CropType[]).map((value) => ({
  value,
  label: CROP_TYPE_LABELS[value],
}));

export const SOIL_TYPE_OPTIONS = (Object.keys(SOIL_TYPE_LABELS) as SoilType[]).map((value) => ({
  value,
  label: SOIL_TYPE_LABELS[value],
}));

export const IRRIGATION_METHOD_OPTIONS = (
  Object.keys(IRRIGATION_METHOD_LABELS) as IrrigationMethod[]
).map((value) => ({ value, label: IRRIGATION_METHOD_LABELS[value] }));

/** Entité Sensor — table `sensors` (ManyToOne Parcel, device_id unique). */
export interface Sensor {
  id: string;
  parcelId: string;
  deviceId: string;
  deviceType: string;
  /**
   * Santé du capteur, calculée par farm-service (machine à états
   * SensorActivityService — seuils configurables côté backend) :
   * - pending  : associé mais jamais vu ;
   * - active   : envoie des données (heartbeat récent) ;
   * - inactive : silencieux > SENSOR_INACTIVE_HOURS (2 h par défaut) ;
   * - failing  : silencieux > SENSOR_FAILING_HOURS (24 h par défaut).
   */
  healthStatus: SensorHealthStatus;
  lastSeenAt: string | null;
  batteryPct: number | null;
  firmwareVersion: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Santé d'un capteur — reflet direct de l'enum PostgreSQL sensor_health_status_enum. */
export type SensorHealthStatus = 'pending' | 'active' | 'inactive' | 'failing';

/**
 * Entité Parcel — table `parcels`.
 *
 * `areaHa` et `flowRateM3h` sont des colonnes DECIMAL sans transformer :
 * le driver pg les renvoie en chaînes (« "2.50" ») — toujours passer par
 * formatAreaHa/parseDecimal pour l'affichage et l'édition.
 *
 * `sensors` est incluse par GET /parcels/farm/:farmId et GET /parcels/:id
 * (extension Phase 4 du farm-service) ; `farm` par GET /parcels/:id.
 */
export interface Parcel {
  id: string;
  farmId: string;
  name: string;
  areaHa: number | string;
  cropType: CropType;
  soilType: SoilType;
  irrigationMethod: IrrigationMethod;
  cropVariety: string | null;
  flowRateM3h: number | string | null;
  treeAgeYears: number | null;
  treeDensityPerHa: number | null;
  polygon: GeoJsonPolygon | null;
  centroid: GeoJsonPoint | null;
  isActive: boolean;
  sensors?: Sensor[];
  farm?: Farm;
  createdAt: string;
  updatedAt: string;
}

/** CreateParcelDto — les 4 champs optionnels ne sont envoyés que s'ils sont renseignés. */
export interface CreateParcelPayload {
  farmId: string;
  name: string;
  areaHa: number;
  cropType: CropType;
  soilType: SoilType;
  irrigationMethod: IrrigationMethod;
  cropVariety?: string;
  flowRateM3h?: number;
  treeAgeYears?: number;
  treeDensityPerHa?: number;
}

/** UpdateParcelDto — tous les champs optionnels, pas de farmId (ferme immuable). */
export interface UpdateParcelPayload {
  name?: string;
  areaHa?: number;
  cropType?: CropType;
  soilType?: SoilType;
  irrigationMethod?: IrrigationMethod;
  cropVariety?: string;
  flowRateM3h?: number;
  treeAgeYears?: number;
  treeDensityPerHa?: number;
}

/** AssociateSensorDto. */
export interface AssociateSensorPayload {
  deviceId: string;
  parcelId: string;
}

/** Statut d'affichage d'un capteur — reflet du healthStatus renvoyé par farm-service. */
export type SensorStatus = 'active' | 'pending' | 'inactive' | 'failing';

/**
 * Statut d'affichage d'un capteur : la source de vérité est le
 * `healthStatus` calculé par farm-service (machine à états à seuils
 * configurables). La fonction est conservée comme point d'entrée unique
 * des composants (pastille, filtres, tri).
 */
export function getSensorStatus(sensor: Sensor): SensorStatus {
  return sensor.healthStatus;
}
