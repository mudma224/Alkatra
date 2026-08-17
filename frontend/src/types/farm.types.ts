/**
 * Types du domaine Farm — alignés sur le code du farm-service
 * (apps/farm-service/src/database/entities/farm.entity.ts + DTOs).
 */

/** Point GeoJSON tel que stocké par PostGIS (SRID 4326). Non éditable en Phase 3. */
export interface GeoJsonPoint {
  type: 'Point';
  coordinates: [number, number];
}

/**
 * Ferme renvoyée par farm-service.
 *
 * NB : `totalAreaHa` est une colonne `DECIMAL(10,2)` côté TypeORM sans
 * transformer — l'API peut donc la sérialiser en chaîne ("12.50").
 * Toujour la passer par `formatAreaHa()` / `parseDecimal()` (utils/format)
 * plutôt que de l'utiliser directement dans un calcul ou un affichage.
 */
export interface Farm {
  id: string;
  ownerId: string;
  name: string;
  totalAreaHa: number | string;
  region: string | null;
  location: GeoJsonPoint | null;
  createdAt: string;
  updatedAt: string;
  /** Relation chargée par GET /farms et GET /farms/:id ; consommée à partir de la Phase 4. */
  parcels?: unknown[];
}

/** Payload de POST /api/v1/farms — CreateFarmDto (whitelist + forbidNonWhitelisted). */
export interface CreateFarmPayload {
  name: string;
  totalAreaHa: number;
  region?: string;
}

/** Payload de PATCH /api/v1/farms/:id — UpdateFarmDto (tous les champs optionnels). */
export interface UpdateFarmPayload {
  name?: string;
  totalAreaHa?: number;
  region?: string | null;
}
