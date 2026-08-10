import styles from './ErrorMessage.module.css';

export interface ErrorMessageProps {
  id?: string;
  message: string;
  /** Optional inline action word (e.g. "Réessayez.") rendered in accent color. */
  actionLabel?: string;
  onAction?: () => void;
}

export function ErrorMessage({ id, message, actionLabel, onAction }: ErrorMessageProps) {
  return (
    <p id={id} role="alert" className={styles.message}>
      {message}
      {actionLabel && (
        <button type="button" className={styles.action} onClick={onAction}>
          {actionLabel}
        </button>
      )}
    </p>
  );
}