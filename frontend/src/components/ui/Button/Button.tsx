import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { LoadingSpinner } from '../LoadingSpinner/LoadingSpinner';
import styles from './Button.module.css';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  children: ReactNode;
  /** Shows a spinner instead of the label and blocks interaction. See guide §10. */
  loading?: boolean;
}

export function Button({
  children,
  loading = false,
  disabled = false,
  type = 'button',
  className,
  ...rest
}: ButtonProps) {
  const visualState = disabled ? styles.disabled : styles.active;

  return (
    <button
      type={type}
      className={[styles.button, visualState, className].filter(Boolean).join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <LoadingSpinner label="Envoi en cours" /> : children}
    </button>
  );
}