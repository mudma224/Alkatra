import styles from './LoadingSpinner.module.css';

export interface LoadingSpinnerProps {
  label?: string;
}

export function LoadingSpinner({ label = 'Chargement' }: LoadingSpinnerProps) {
  return (
    <span className={styles.spinner} role="status" aria-label={label}>
      <span className={styles.circle} />
    </span>
  );
}