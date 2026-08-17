/**
 * Helpers de formatage partagés par les écrans Fermes (Phase 3).
 * Toutes les valeurs proviennent de l'API et peuvent être sérialisées
 * sous forme de chaînes (TypeORM decimal) — ces helpers coercissent
 * systématiquement en nombre avant formatage.
 */

/**
 * Parse une saisie utilisateur de surface ("12,5", "12.5", "8").
 * Retourne `NaN` si la valeur n'est pas un nombre exploitable.
 */
export function parseDecimal(input: string): number {
  return Number(input.trim().replace(',', '.'));
}

/**
 * Formate une surface en hectares pour l'affichage (badge FarmCard,
 * Info Card FarmDetail). Conforme aux maquettes : "12.50" → "12.5",
 * "8.00" → "8.0" (au moins une décimale, zéros superflus trimés).
 */
export function formatAreaHa(value: number | string): string {
  const parsed = typeof value === 'number' ? value : parseDecimal(value);
  if (!Number.isFinite(parsed)) {
    return String(value);
  }
  return parsed.toFixed(2).replace(/0$/, '');
}

const frenchLongDateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * Formate une date ISO en français long : "2026-08-12T…" → "12 août 2026"
 * (maquette FarmDetail, ligne « Créée le »).
 */
export function formatDateFr(isoDate: string): string {
  return frenchLongDateFormatter.format(new Date(isoDate));
}

/**
 * Normalise une chaîne pour la recherche : minuscules + suppression
 * des diacritiques ("Aït" ~ "ait").
 */
export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/** Voyelles (avec diacritiques fréquents) déclenchant l'élision française. */
const ELISION_VOWELS = new Set('aàâeéèêiîoôuûh');

/**
 * Libellé de région pour la FarmCard, avec élision française :
 * "Marrakech" → "Région de Marrakech", "Errachidia" → "Région d'Errachidia"
 * (maquette FarmList - Populated).
 */
export function formatRegionLabel(region: string): string {
  const first = normalizeSearch(region).charAt(0);
  const preposition = ELISION_VOWELS.has(first) ? "d'" : 'de ';
  return `Région ${preposition}${region}`;
}
