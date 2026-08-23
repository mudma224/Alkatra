/**
 * Options du module d'observabilité partagé.
 *
 * Chaque service instancie `ObservabilityModule.forRoot({ prefix: '<service>' })` :
 * le préfixe sert à nommer les métriques standard (`<prefix>_http_requests_total`,
 * etc.) et doit être un identifiant Prometheus valide.
 */
export interface ObservabilityOptions {
  /** Préfixe des métriques standard, ex. `farm`, `auth`. */
  prefix: string;
}

/** Jet d'injection des options dans les providers du package. */
export const OBSERVABILITY_OPTIONS = 'ALKATRA_OBSERVABILITY_OPTIONS';

const METRIC_NAME_PART = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

/** Valide le préfixe (identifiant Prometheus) — échoue tôt plutôt qu'à l'exposition. */
export function assertValidPrefix(prefix: string): void {
  if (!METRIC_NAME_PART.test(prefix)) {
    throw new Error(
      `Préfixe d'observabilité invalide : "${prefix}" ` +
        `(doit matcher ${METRIC_NAME_PART})`,
    );
  }
}
