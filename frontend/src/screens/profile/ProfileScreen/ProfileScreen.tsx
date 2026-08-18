import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, Tractor, UserRoundPen } from 'lucide-react';

import { ProfileIdentity } from '../../../components/profile/ProfileIdentity/ProfileIdentity';
import { ProfileMenuItem } from './ProfileMenuItem';
import { ErrorMessage } from '../../../components/ui/ErrorMessage/ErrorMessage';
import { LoadingSpinner } from '../../../components/ui/LoadingSpinner/LoadingSpinner';

import { userApi } from '../../../api/user.api';
import { useAuthStore } from '../../../store/auth.store';

import styles from './ProfileScreen.module.css';

type ScreenStatus = 'loading' | 'error' | 'success';

/**
 * Displays the authenticated user's profile summary and the entry points
 * to related sections (edit profile, farms, notifications).
 *
 * Always re-fetches the profile on mount rather than trusting whatever is
 * already in the store, so the screen reflects the backend's current
 * data even if it changed elsewhere. The fetched profile is written back
 * into the shared auth store via `updateUser`, so every other consumer
 * (e.g. the app Header, once it reads `user`) stays in sync automatically
 * — there is deliberately no separate local copy of the profile.
 */
export function ProfileScreen() {
  const navigate = useNavigate();

  const user = useAuthStore((state) => state.user);
  const updateUser = useAuthStore((state) => state.updateUser);

  const [status, setStatus] = useState<ScreenStatus>('loading');

  const fetchProfile = useCallback(async () => {
    setStatus('loading');

    try {
      const profile = await userApi.getProfile();

      // Keep the authenticated user's profile in the shared auth store.
      updateUser(profile);

      setStatus('success');
    } catch (error) {
      // Keep the raw error available in the console for observability.
      console.error('getProfile failed', error);

      setStatus('error');
    }
  }, [updateUser]);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  if (status === 'loading') {
    return (
      <main className={styles.page}>
        <div className={styles.loadingState}>
          <LoadingSpinner label="Chargement du profil" />
        </div>
      </main>
    );
  }

  // A failed fetch and a successful-but-empty result are shown the same
  // way: there is nothing meaningful to render without a user.
  if (status === 'error' || !user) {
    return (
      <main className={styles.page}>
        <div className={styles.errorState}>
          <ErrorMessage
            message="Impossible de charger votre profil."
            actionLabel="Réessayez."
            onAction={() => void fetchProfile()}
          />
        </div>
      </main>
    );
  }

  return (
    <main className={styles.page}>
      <section className={styles.herosection} aria-label="En-tête du profil">
       <div className={styles.headerRow}>
        <button
          type="button"
          className={styles.backButton}
          onClick={() => navigate(-1)}
          aria-label="Retour"
        >
          <ArrowLeft aria-hidden="true" />
        </button>

        <h1 className={styles.title}>Mon Profil</h1>
       </div>
      </section>

      <div className={styles.content}>
        <div className={styles.identityOverlap}>
          <ProfileIdentity user={user} />
        </div>

        <section className={styles.menu} aria-label="Options du profil">
          <ProfileMenuItem
            icon={<UserRoundPen aria-hidden="true" />}
            label="Editer mon profil"
            onClick={() => navigate('/profile/edit')}
          />

          {/*
            Routes to the real /farms entry (a placeholder screen for now,
            per router/index.tsx) instead of an empty onClick — see the
            audit summary at the top of this guide.
          */}
          <ProfileMenuItem
            icon={<Tractor aria-hidden="true" />}
            label="Consulter mes fermes"
            onClick={() => navigate('/farms')}
          />

          {/*
            No route exists yet for notifications (alert-service is a
            later phase) — rendered as a genuinely disabled row instead
            of a button that silently does nothing when pressed.
          */}
          <ProfileMenuItem
            icon={<Bell aria-hidden="true" />}
            label="Notifications"
            disabled
          />
        </section>
      </div>
    </main>
  );
}