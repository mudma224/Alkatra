import { User } from 'lucide-react';
import styles from './Avatar.module.css';

export interface AvatarProps {
  /** Full name used to compute the displayed initials. `null` renders a generic icon instead. */
  name: string | null;
  /** Diameter of the avatar circle, in pixels. */
  size?: number;
}

/**
 * Extracts up to two initials from a full name.
 *
 * Examples:
 * "Aziz Tazi" -> "AT"
 * "Aziz Ben Tazi" -> "AT" (first + last word only)
 * "Aziz" -> "A"
 */
function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);
  const firstLetter = words[0][0];

  if (words.length === 1) {
    return firstLetter.toUpperCase();
  }

  const lastLetter = words[words.length - 1][0];
  return `${firstLetter}${lastLetter}`.toUpperCase();
}

/**
 * Placeholder avatar for the current MVP.
 *
 * There is no `avatarUrl` field on `UserEntity` and no upload endpoint on
 * the backend (auth-service / user-service) — building real photo upload
 * would require a new DB column, a new endpoint, and object storage
 * (MinIO is provisioned in docker-compose but unused). That's out of
 * scope here; flagged as a Phase 2 backend item.
 *
 * Shows the user's initials on a solid circle, or a generic person icon
 * when no name is set yet (`name` is nullable on `UserEntity`).
 */
export function Avatar({ name, size = 64 }: AvatarProps) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.circle} style={{ width: size, height: size }}>
        {name ? (
          <span className={styles.initials}>{getInitials(name)}</span>
        ) : (
          <User className={styles.icon} aria-label="Utilisateur sans nom" />
        )}
      </div>
    </div>
  );
}