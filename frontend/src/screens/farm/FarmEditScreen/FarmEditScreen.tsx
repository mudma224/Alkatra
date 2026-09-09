import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';

import { BackNavigation } from '../../../components/layout/BackNavigation/BackNavigation';
import { Button } from '../../../components/ui/Button/Button';
import { EmptyState } from '../../../components/ui/EmptyState/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton/Skeleton';
import { FarmForm } from '../../../components/farm/FarmForm/FarmForm';
import { useFarm, useUpdateFarm } from '../../../hooks/useFarms';
import { formatAreaHa } from '../../../utils/format';
import type { CreateFarmPayload } from '../../../types/farm.types';

import styles from './FarmEditScreen.module.css';

/** Lets the user update an existing farm. */
export function FarmEditScreen() {
  const { farmId } = useParams<{ farmId: string }>();
  const navigate = useNavigate();

  const { farm, status, refetch } = useFarm(farmId);
  const { update, isUpdating } = useUpdateFarm();
  const [submitError, setSubmitError] = useState(false);

  // Avoid creating a malformed `/farms/undefined` fallback route.
  const farmDetailPath = farmId ? `/farms/${farmId}` : '/farms';
  const backToDetail = () => navigate(farmDetailPath, { replace: true });

  const handleSubmit = async (payload: CreateFarmPayload) => {
    if (!farmId) {
      return;
    }

    setSubmitError(false);

    const succeeded = await update(farmId, payload);

    if (succeeded) {
      navigate(farmDetailPath, { replace: true });
    } else {
      setSubmitError(true);
    }
  };

  return (
    <section className={styles.screen}>
      <div className={styles.topBar}>
        {/* Reuse the shared control and keep the destination deterministic. */}
        <BackNavigation
          to={farmDetailPath}
          replace
          disabled={isUpdating}
        />

        <h1 className={styles.title}>Modifier la ferme</h1>
      </div>

      {status === 'loading' && (
        <div className={styles.skeletons}>
          <Skeleton className={styles.skeletonField} />
          <Skeleton className={styles.skeletonField} />
          <Skeleton className={styles.skeletonField} />
          <Skeleton className={styles.skeletonButton} />
        </div>
      )}

      {status === 'error' && (
        <EmptyState
          icon={AlertCircle}
          title="Oups !"
          description="Impossible de charger cette ferme."
          action={
            <Button
              variant="primary"
              className={styles.retryButton}
              onClick={refetch}
            >
              Réessayer
            </Button>
          }
        />
      )}

      {status === 'success' && farm && (
        <FarmForm
          initialValues={{
            name: farm.name,
            area: formatAreaHa(farm.totalAreaHa),
            region: farm.region ?? '',
          }}
          submitting={isUpdating}
          serverError={
            submitError ? 'Impossible de modifier la ferme. Réessayez.' : null
          }
          onSubmit={(payload) => void handleSubmit(payload)}
          onCancel={backToDetail}
        />
      )}
    </section>
  );
}