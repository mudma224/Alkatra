import { useEffect, useRef } from 'react';
import { AlertCircle } from 'lucide-react';
import { Button } from '../Button/Button';
import styles from './ConfirmDialog.module.css';

export interface ConfirmDialogProps {
  /** La modale ne rend rien tant que `open` est faux. */
  open: boolean;
  /** Titre de la confirmation (ex. « Supprimer cette ferme ? »). */
  title: string;
  /** Lignes de description centrées sous le titre. */
  description?: string[];
  /** Label du bouton d'annulation (gauche). */
  cancelLabel: string;
  /** Label du bouton de confirmation (droite, variante destructive). */
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  /** Bouton de confirmation en chargement ; verrouille aussi l'annulation et Échap. */
  busy?: boolean;
  /** Message d'erreur métier à afficher dans la modale (ex. conflit 409). */
  errorMessage?: string | null;
}

/**
 * Modale de confirmation générique (apparence : maquette validée
 * « FarmDetail - Delete Modal », node Figma 83:93 — overlay sombre,
 * card centrée 340×280, icône d'alerte, deux boutons 140px).
 *
 * Utilisée pour la suppression de ferme (Phase 3) et réutilisable
 * pour les confirmations destructives des phases suivantes.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
  busy = false,
  errorMessage = null,
}: ConfirmDialogProps) {
  const cardRef = useRef<HTMLDivElement>(null);

  /*
   * Accessibilité : le focus démarre dans la modale (le composant Button ne
   * forward pas de ref, on focus donc la card elle-même) et Échap ferme la
   * modale, sauf pendant une confirmation en cours.
   */
  useEffect(() => {
    if (!open) {
      return;
    }

    cardRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) {
        onCancel();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, busy, onCancel]);

  if (!open) {
    return null;
  }

  return (
    <div className={styles.overlay} role="presentation">
      <div
        ref={cardRef}
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        tabIndex={-1}
      >
        <span className={styles.iconWrapper}>
          <AlertCircle className={styles.icon} aria-hidden="true" />
        </span>

        <h2 id="confirm-dialog-title" className={styles.title}>
          {title}
        </h2>

        {description?.map((line) => (
          <p key={line} className={styles.description}>
            {line}
          </p>
        ))}

        {errorMessage && (
          <p role="alert" className={styles.error}>
            {errorMessage}
          </p>
        )}

        <div className={styles.actions}>
          <Button
            variant="secondary"
            className={styles.dialogButton}
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </Button>
          <Button
            variant="destructive"
            className={styles.dialogButton}
            onClick={onConfirm}
            loading={busy}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
