import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft } from 'lucide-react';

import { Button } from '../../../components/ui/Button/Button';
import { EmptyState } from '../../../components/ui/EmptyState/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton/Skeleton';
import { FarmForm } from '../../../components/farm/FarmForm/FarmForm';
import { useFarm, useUpdateFarm } from '../../../hooks/useFarms';
import { formatAreaHa } from '../../../utils/format';
import type { CreateFarmPayload } from '../../../types/farm.types';

import styles from './FarmEditScreen.module.css';

/**
 * Modification d'une ferme (route /farms/:farmId/edit).
 *
 * Option (a) validée par l'utilisateur : la maquette « FarmCreate » (83:55)
 * est réutilisée en mode édition — même formulaire (FarmForm partagé),
 * pré-rempli avec la ferme existante, titre « Modifier la ferme ».
 *
 * Enregistrer → PATCH /farms/:id → retour au détail de la ferme (rafraîchi) ;
 * Annuler / Retour → détail sans modification.
 */
export function FarmEditScreen() {
  const { farmId } = useParams<{ farmId: string }>();
  const navigate = useNavigate();

  const { farm, status, refetch } = useFarm(farmId);
  const { update, isUpdating } = useUpdateFarm();
  const [submitError, setSubmitError] = useState(false);

  const backToDetail = () => navigate(`/farms/${farmId}`, { replace: true });

  const handleSubmit = async (payload: CreateFarmPayload) => {
    if (!farmId) {
      return;
    }

    setSubmitError(false);

    const succeeded = await update(farmId, payload);

    if (succeeded) {
      navigate(`/farms/${farmId}`, { replace: true });
    } else {
      setSubmitError(true);
    }
  };

  return (
    <section className={styles.screen}>
      <div className={styles.topBar}>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Retour"
          onClick={backToDetail}
          disabled={isUpdating}
        >
          <ArrowLeft aria-hidden="true" />
        </Button>

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
            <Button variant="primary" className={styles.retryButton} onClick={refetch}>
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
          serverError={submitError ? 'Impossible de modifier la ferme. Réessayez.' : null}
          onSubmit={(payload) => void handleSubmit(payload)}
          onCancel={backToDetail}
        />
      )}
    </section>
  );
}
