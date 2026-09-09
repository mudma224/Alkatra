#!/usr/bin/env node
/**
 * Validation des dashboards Grafana provisionnés (exécuté par ci-observability).
 *
 * Contrôles :
 *  1. JSON parseable
 *  2. uid présent, préfixé `alkatra-`, unique
 *  3. description présente (convention du design)
 *  4. refresh >= 15s
 *  5. datasource référencée par nom (ADR-0003) : "Prometheus" ou "Loki"
 *  6. aucun dashboard à la racine (foldersFromFilesStructure exige un dossier)
 *
 * Usage : node scripts/validate-dashboards.mjs [racine des dashboards]
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.argv[2] ?? 'infra/grafana/dashboards';
const errors = [];
const uids = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full);
      continue;
    }
    if (!entry.endsWith('.json')) continue;

    const rel = relative(root, full);
    if (!rel.includes('\\') && !rel.includes('/')) {
      errors.push(`${rel}: à la racine — placer le dashboard dans un sous-dossier (foldersFromFilesStructure)`);
    }

    let dashboard;
    try {
      dashboard = JSON.parse(readFileSync(full, 'utf8'));
    } catch (err) {
      errors.push(`${rel}: JSON invalide (${err.message})`);
      continue;
    }

    const uid = dashboard.uid ?? '';
    if (!/^alkatra-[a-z0-9-]+$/.test(uid)) {
      errors.push(`${rel}: uid invalide "${uid}" (attendu : alkatra-*)`);
    }
    uids.push([uid, rel]);

    if (!dashboard.description) {
      errors.push(`${rel}: description manquante`);
    }

    const refresh = dashboard.refresh ?? '30s';
    const seconds = refresh.endsWith('s')
      ? Number(refresh.slice(0, -1))
      : refresh.endsWith('m')
        ? Number(refresh.slice(0, -1)) * 60
        : Infinity;
    if (seconds < 15) {
      errors.push(`${rel}: refresh ${refresh} trop rapide (minimum 15s)`);
    }

    const content = JSON.stringify(dashboard);
    if (!content.includes('"Prometheus"') && !content.includes('"Loki"')) {
      errors.push(`${rel}: aucune datasource par nom (Prometheus/Loki)`);
    }
  }
}

walk(root);

const seen = new Map();
for (const [uid, rel] of uids) {
  if (seen.has(uid)) {
    errors.push(`uid dupliqué "${uid}" : ${seen.get(uid)} et ${rel}`);
  } else {
    seen.set(uid, rel);
  }
}

if (errors.length > 0) {
  console.error(`✗ ${errors.length} erreur(s) de validation des dashboards :`);
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log(`✓ ${uids.length} dashboards valides (uid uniques, conventions respectées)`);
