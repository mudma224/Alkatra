import { Avatar } from '../Avatar/Avatar';
import type { AuthUser } from '../../../types/auth.types';
import styles from './ProfileIdentity.module.css';

export interface ProfileIdentityProps {
  user: AuthUser;
  /** Avatar diameter in pixels. Defaults to the size used on both Figma screens. */
  avatarSize?: number;
}

/**
 * Avatar + name + phone number — the header block shown identically at
 * the top of the Profile screen and the Edit Profile screen.
 *
 * Extracted out of ProfileScreen once EditProfileScreen needed the exact
 * same markup: duplicating it across two screens would have violated
 * "éviter la duplication de code" the moment the second screen existed.
 * (Before that, when only ProfileScreen used it, keeping it inline was
 * correct — extracting earlier would have been premature.)
 *
 * Shows the phone number instead of a "role / location" subtitle: the
 * backend's UserEntity has neither field, and inventing one to match the
 * Figma text would mean silently inventing an API contract that doesn't
 * exist. Phone number is real, always-available backend data instead.
 */
export function ProfileIdentity({ user, avatarSize = 100 }: ProfileIdentityProps) {
  return (
    <div className={styles.wrapper}>
      <Avatar name={user.name} size={avatarSize} />

      <div className={styles.info}>
        <h2 className={styles.name}>{user.name ?? 'Utilisateur'}</h2>
        <p className={styles.phone}>{user.phone}</p>
      </div>
    </div>
  );
}