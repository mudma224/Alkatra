import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import styles from './BackNaviagtion.module.css';

export interface BackNavigationProps {
  /** Accessible label for the back action. */
  label?: string;

  /** Optional class name used when a screen needs local positioning. */
  className?: string;
}

/**
 * Shared back-navigation control used by authenticated screens.
 *
 * The component owns only navigation UI/behavior. Screen-specific layout
 * remains in the screen itself so this does not introduce a broad refactor.
 */
export function BackNavigation({
  label = 'Retour',
  className,
}: BackNavigationProps) {
  const navigate = useNavigate();

  const classes = className
    ? `${styles.backButton} ${className}`
    : styles.backButton;

  return (
    <button
      type="button"
      className={classes}
      onClick={() => navigate(-1)}
      aria-label={label}
    >
      {/* Keep the same ArrowLeft icon everywhere. */}
      <ArrowLeft aria-hidden="true" />
    </button>
  );
}