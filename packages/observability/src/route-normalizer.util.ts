/**
 * Normalise la requête en pattern de route pour les labels Prometheus.
 *
 * On remonte `req.route.path` (pattern Express, ex. `/api/v1/farms/:id`) plutôt
 * que l'URL réelle afin d'éviter l'explosion de cardinalité des labels (une
 * série par identifiant distinct). Toute requête sans route résolue (404 avant
 * le routeur Nest, websocket, etc.) est agrégée sous `unmatched`.
 */
export class RouteNormalizerUtil {
  static normalize(req: {
    route?: { path?: string | string[] | RegExp };
  }): string {
    const path = req.route?.path;

    if (typeof path === 'string' && path.length > 0) {
      return path;
    }
    if (Array.isArray(path) && typeof path[0] === 'string' && path[0].length > 0) {
      return path[0];
    }
    if (path instanceof RegExp) {
      return `regex:${path.source}`;
    }
    return 'unmatched';
  }
}
