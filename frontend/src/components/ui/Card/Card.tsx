import type { HTMLAttributes } from 'react';
import styles from './Card.module.css';

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Si `true`, la carte occupe toute la largeur disponible. Par défaut `true`. */
  block?: boolean;
  /** Si `true`, ajoute l'ombre portée légère définie dans tokens (`--shadow-card`). */
  elevated?: boolean;
}

/**
 * Carte générique du design system.
 *
 * Surface blanche avec coins arrondis (`--radius-card`) et padding standard.
 * Utilisée pour contenir des groupes logiques (formulaires, listes, détails).
 * Le padding par défaut est `var(--spacing-lg)` (24px) ; un padding personnalisé
 * se passe via `style` ou une classe `className`.
 *
 * `elevated` ajoute l'ombre définie dans `--shadow-card` (utile pour les cartes
 * qui chevauchent un hero ou une autre surface).
 */
export function Card({
  block = true,
  elevated = false,
  className,
  children,
  ...rest
}: CardProps) {
  return (
    <div
      className={[
        styles.card,
        elevated ? styles.elevated : null,
        block ? styles.block : null,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}
