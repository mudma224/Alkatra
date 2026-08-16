import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import styles from './ProfileMenuItem.module.css';

export interface ProfileMenuItemProps {
  /** Icon displayed on the left side of the menu item. */
  icon: ReactNode;

  /** Text displayed next to the icon. */
  label: string;

  /** Whether to display the right arrow. */
  rightArrow?: boolean;

  /**
   * Whether this row is currently reachable. Rows that point at screens
   * that don't exist yet in the app (e.g. Notifications, before
   * alert-service ships) must be `disabled` rather than wired to an
   * empty `onClick` — a real `<button disabled>` communicates "not yet
   * available" honestly; a no-op click handler looks broken instead.
   */
  disabled?: boolean;

  /** Called when the user selects the menu item. Omit when `disabled`. */
  onClick?: () => void;
}

export function ProfileMenuItem({
  icon,
  label,
  rightArrow = true,
  disabled = false,
  onClick,
}: ProfileMenuItemProps) {
  return (
    <button
      type="button"
      className={styles.profileMenuItem}
      onClick={onClick}
      disabled={disabled}
    >
      <span className={styles.content}>
        <span className={styles.icon}>{icon}</span>
        <span className={styles.label}>{label}</span>
      </span>

      {rightArrow && (
        <ChevronRight className={styles.arrow} aria-hidden="true" />
      )}
    </button>
  );
}