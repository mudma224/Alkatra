import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { User as UserIcon } from 'lucide-react';

import { BackNavigation } from '../../../components/layout/BackNavigation/BackNavigation';
import { isAxiosError } from 'axios';

import { ProfileIdentity } from '../../../components/profile/ProfileIdentity/ProfileIdentity';
import { Input } from '../../../components/ui/Input/Input';
import { Select } from '../../../components/ui/Select/Select';
import { Button } from '../../../components/ui/Button/Button';
import { ErrorMessage } from '../../../components/ui/ErrorMessage/ErrorMessage';

import { userApi } from '../../../api/user.api';
import { useAuthStore } from '../../../store/auth.store';
import type { ApiErrorResponse } from '../../../types/api.types';
import type { AuthUser } from '../../../types/auth.types';

import styles from './EditProfileScreen.module.css';

type FormStatus = 'idle' | 'submitting';

/**
 * Options for the "Langue" select, matching UpdateProfileDto's
 * `@IsIn(['french', 'arabic', 'darija'])` exactly.
 *
 * Kept local to this screen since it's currently the only consumer — if
 * a second screen ever needs the same list (e.g. a future settings
 * screen), promote it to a shared constant then, not before.
 */
const LANGUAGE_OPTIONS: { value: AuthUser['preferredLanguage']; label: string }[] = [
  { value: 'french', label: 'Français' },
  { value: 'arabic', label: 'Arabe' },
  { value: 'darija', label: 'Darija' },
];

/**
 * Lets the authenticated user edit `name` and `preferredLanguage` — the
 * only two fields UpdateProfileDto accepts. Phone number is not shown as
 * editable: it isn't in the Figma design and the backend has no flow for
 * changing a verified phone number without re-running OTP verification.
 *
 * Does NOT issue its own GET /user/profile: by the time this screen is
 * reachable, ProfileScreen has already fetched and stored a fresh
 * `user`. Reading it straight from the store avoids a redundant network
 * round-trip for data that's already known to be current.
 */
export function EditProfileScreen() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);

  // Hooks are declared unconditionally, before any early return, per the
  // Rules of Hooks — even though `user` might be null on the render
  // where the guard below immediately redirects away.
  const [name, setName] = useState(user?.name ?? '');
  const [preferredLanguage, setPreferredLanguage] = useState<AuthUser['preferredLanguage']>(
    user?.preferredLanguage ?? 'darija',
  );
  const [status, setStatus] = useState<FormStatus>('idle');
  const [error, setError] = useState<string | null>(null);

  /*
   * /profile/edit should only ever be reached with a user already
   * loaded (ProfileScreen fetches it before linking here). If it's
   * missing for any reason, redirect back to /profile — which will
   * fetch it — instead of rendering a broken form.
   *
   * Uses a declarative <Navigate>, mirroring the pattern router/index.tsx
   * already uses for OtpRoute's missing-state guard, rather than calling
   * navigate() imperatively during render.
   */
  if (!user) {
    return <Navigate to="/profile" replace />;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (status === 'submitting') {
      return;
    }

    setError(null);
    setStatus('submitting');

    try {
      const trimmedName = name.trim();

      const updated = await userApi.updateProfile({
        // Backend treats `name` as optional (class-validator
        // @IsOptional()). Sending `undefined` for an emptied field means
        // "leave it unset", rather than persisting an empty string.
        name: trimmedName === '' ? undefined : trimmedName,
        preferredLanguage,
      });

      // Same store action ProfileScreen uses — keeps every screen that
      // reads `user` (this one, ProfileScreen, and eventually the app
      // Header) in sync without a second fetch.
      updateUser(updated);

      navigate('/profile', { replace: true });
    } catch (caughtError) {
      setStatus('idle');

      if (isAxiosError<ApiErrorResponse>(caughtError)) {
        console.error(
          'updateProfile failed',
          caughtError.response?.data ?? caughtError.message,
        );
      } else {
        console.error('updateProfile failed', caughtError);
      }

      setError("Impossible d'enregistrer les modifications. Réessayez.");
    }
  };

  return (
    <main className={styles.page}>
      <div className={styles.content}>
       <div className={styles.headerRow}>
        <button
          type="button"
          className={styles.backButton}
          aria-label="Retour"
        >
          <BackNavigation />
        </button>

        <h1 className={styles.title}>Editer mon profil</h1>
       </div>

        <div className={styles.profileHeader}>
          <ProfileIdentity user={user} />
        </div>
        

        <div className={styles.formWrapper}>
         <form className={styles.form} onSubmit={handleSubmit} noValidate>
          <Input
            id="name"
            name="name"
            type="text"
            label="Nom"
            placeholder="Entrer votre nom"
            prefix={<UserIcon size={18} aria-hidden="true" />}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
            disabled={status === 'submitting'}
          />

          <Select
            id="preferredLanguage"
            name="preferredLanguage"
            label="Langue"
            placeholder="Choisir une langue"
            value={preferredLanguage}
            onChange={(value) =>
              setPreferredLanguage(value as AuthUser['preferredLanguage'])
            }
            options={LANGUAGE_OPTIONS}
            disabled={status === 'submitting'}
          />

          {error && <ErrorMessage message={error} />}

          <Button
            type="submit"
            variant="primary"
            block
            loading={status === 'submitting'}
          >
            Enregistrer
          </Button>
        </form>
       </div>
      </div>
    </main>
  );
}