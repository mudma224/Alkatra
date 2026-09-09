import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import styles from './EmptyState.module.css';

export interface EmptyStateProps {
  /** Icône illustrative (composant lucide-react, ex. `Sparkles`). */
  icon?: LucideIcon;
  /** Titre court décrivant l'état vide (ex. "Aucune ferme"). */
  title: string;
  /** Description ou aide à l'action. */
  description?: string;
  /** Action optionnelle (typiquement un `<Button variant="primary">`). */
  action?: ReactNode;
}

/**
 * État vide standardisé pour les listes, pages de résultats, etc.
 *
 * Centré verticalement et horizontalement, avec une icône optionnelle,
 * un titre, une description et une action (CTA). Conçu pour les écrans
 * Farm list, Recommendation history, Parcel list lorsqu'aucune donnée
 * n'est disponible.
 *
 * L'apparence (icône, espacement) s'aligne sur les conventions du Login
 * (couleur primary pour l'icône, typo Inter).
 */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className={styles.wrapper} role="status">
      {Icon && (
        <span className={styles.iconWrapper}>
          <Icon className={styles.icon} aria-hidden="true" />
        </span>
      )}
      <h2 className={styles.title}>{title}</h2>
      {description && <p className={styles.description}>{description}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
