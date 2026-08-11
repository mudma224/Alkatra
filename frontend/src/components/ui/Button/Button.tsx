import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { LoadingSpinner } from '../LoadingSpinner/LoadingSpinner';
import type { ButtonSize, ButtonVariant } from '../../../types/ui.types';
import styles from './Button.module.css';

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Contenu textuel du bouton. Obligatoire pour l'accessibilité. */
  children: ReactNode;
  /**
   * Variante visuelle, alignée sur le Button system Figma.
   * `primary` (CTA principal), `secondary` (alternative), `outline` (léger),
   * `ghost` (navigation), `destructive` (action irréversible), `link` (lien).
   */
  variant: ButtonVariant;
  /** Taille du bouton. `md` par défaut (48px de haut, conforme Figma). */
  size?: ButtonSize;
  /** Icône affichée à gauche du label. Attend un composant lucide-react (ex. `<Search />`). */
  iconLeft?: ReactNode;
  /** Icône affichée à droite du label. Attend un composant lucide-react. */
  iconRight?: ReactNode;
  /** Affiche un spinner à la place du label et bloque l'interaction. */
  loading?: boolean;
  /** Si `true`, le bouton occupe toute la largeur disponible (fill). */
  block?: boolean;
}

/**
 * Bouton du design system Al Katra.
 *
 * La prop `variant` est obligatoire (breaking change vs version précédente) :
 * tout consommateur doit déclarer explicitement la variante voulue, ce qui
 * évite les oublis involontaires d'un CTA primary par défaut.
 *
 * Les icônes se passent via `iconLeft` / `iconRight` (composition React) plutôt
 * que par un nom de string, pour bénéficier du tree-shaking de lucide-react
 * et du typage statique.
 */
export function Button({
  children,
  variant,
  size = 'md',
  iconLeft,
  iconRight,
  loading = false,
  disabled = false,
  block = false,
  type = 'button',
  className,
  ...rest
}: ButtonProps) {
  const iconClass = size === 'sm' ? styles.iconSm : styles.iconMd;

  return (
    <button
      type={type}
      className={[
        styles.button,
        styles[variant],
        styles[size],
        block ? styles.block : null,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-block={block || undefined}
      {...rest}
    >
      {loading ? (
        <LoadingSpinner label="Chargement" />
      ) : (
        <>
          {iconLeft && <span className={iconClass}>{iconLeft}</span>}
          {children}
          {iconRight && <span className={iconClass}>{iconRight}</span>}
        </>
      )}
    </button>
  );
}
