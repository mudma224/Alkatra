import { ArrowLeft } from 'lucide-react';
import { useNavigate, type To } from 'react-router-dom';

import styles from './BackNavigation.module.css';

export interface BackNavigationProps {
  /** Accessible label for the back action. */
  label?: string;

  /** Optional class name used when a screen needs local positioning. */
  className?: string;

  /** Optional stable destination for screens with a known parent route. */
  to?: To;

  /** Replaces the current history entry when using an explicit destination. */
  replace?: boolean;

  /** Prevents navigation while the current screen is submitting data. */
  disabled?: boolean;
}

/** Shared and accessible back-navigation control for authenticated screens. */
export function BackNavigation({
  label = 'Retour',
  className,
  to,
  replace = false,
  disabled = false,
}: BackNavigationProps) {
  const navigate = useNavigate();

  const classes = className
    ? `${styles.backButton} ${className}`
    : styles.backButton;

  const handleBack = () => {
    if (to !== undefined) {
      // Use the stable parent route supplied by the current screen.
      navigate(to, { replace });
      return;
    }

    // Keep history navigation available for screens without a fixed parent.
    navigate(-1);
  };

  return (
    <button
      type="button"
      className={classes}
      onClick={handleBack}
      aria-label={label}
      disabled={disabled}
    >
      {/* The same icon is rendered by every migrated screen. */}
      <ArrowLeft aria-hidden="true" />
    </button>
  );
}