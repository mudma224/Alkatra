import { User } from 'lucide-react';
import styles from './Avatar.module.css';

export interface AvatarProps {
  /**
   * Name displayed in the Avatar.
   */
  name: string | null;

  /**
   * Size of the Avatar in pixels.
   */
  size?: number;
}

/**
 * Returns the initials of a user's name.
 *
 * Examples:
 * "Aziz Tazi" -> "AT"
 * "Aziz Ben Tazi" -> "AT"
 * "Aziz" -> "A"
 */
function getInitials(name: string): string {
  const words = name.trim().split(/\s+/);

  const firstLetter = words[0][0];

  // If the name contains only one word, use its first letter.
  if (words.length === 1) {
    return firstLetter.toUpperCase();
  }

  const lastLetter = words[words.length - 1][0];

  return `${firstLetter}${lastLetter}`.toUpperCase();
}

export function Avatar({ name, size = 64}: AvatarProps) {
  return (
    <div
      className={styles.AvatarWrapper}
    >
      <div className={styles.imgframe}
           style={{ width: size, height: size }}
      >
        /** this is a temporary design but in the
         future we will allow users to add their profile photos 
        */

        <div className={styles.ColoredtempImg}>
          {name ? (
            <span className={styles.initialsStyle}>
              {getInitials(name)}
            </span>
          ) : (
            <User
              className={styles.userIcon}
              aria-label="Utilisateur sans nom"
            />
          )}
        </div>
      </div>
    </div>
  );
}

