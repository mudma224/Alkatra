import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import styles from './ProfileMenuItem.module.css';

export interface ProfileMenuItemProps {
  /**
   * Icon displayed on the left side of the menu item.
   */
  icon: ReactNode;

  /**
   * Text displayed next to the icon.
   */
  label: string;

  /**
   * Whether to display the right arrow.
   */
  rightArrow?: boolean;

  /**
   * Called when the user selects the menu item.
   */
  onClick: () => void;
}

export function ProfileMenuItem({
  icon,
  label,
  rightArrow = true,
  onClick,
}: ProfileMenuItemProps) {
  return (
    <button
      type="button"
      className={styles.profileMenuItem}
      onClick={onClick}
    >
      <span className={styles.content}>
        <span className={styles.icon}>{icon}</span>

        <span className={styles.label}>{label}</span>
      </span>

      {rightArrow && (
        <ChevronRight
          className={styles.arrow}
          aria-hidden="true"
        />
      )}
    </button>
  );
}