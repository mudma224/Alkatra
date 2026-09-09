import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft } from 'lucide-react';

import { Button } from '../../../components/ui/Button/Button';
import { EmptyState } from '../../../components/ui/EmptyState/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton/Skeleton';
import { ParcelForm } from '../../../components/parcel/ParcelForm/ParcelForm';
import type { ParcelFormValues } from '../../../components/parcel/ParcelForm/ParcelForm';
import { useParcel, useUpdateParcel } from '../../../hooks/useParcels';
import { formatAreaHa } from '../../../utils/format';
import type { Parcel } from '../../../types/parcel.types';

import styles from './ParcelEditScreen.module.css';

/** Pré-remplissage depuis la parcelle existante (décimaux re-formatés « 2.50 » → « 2.5 »). */
function toFormValues(parcel: Parcel): ParcelFormValues {
  return {
    name: parcel.name,
    area: formatAreaHa(parcel.areaHa),
    cropType: parcel.cropType,
    soilType: parcel.soilType,
    irrigationMethod: parcel.irrigationMethod,
    cropVariety: parcel.cropVariety ?? '',
    flowRate: parcel.flowRateM3h == null ? '' : formatAreaHa(parcel.flowRateM3h),
    treeAge: parcel.treeAgeYears == null ? '' : String(parcel.treeAgeYears),
    treeDensity: parcel.treeDensityPerHa == null ? '' : String(parcel.treeDensityPerHa),
  };
}

/**
 * Édition d'une parcelle (route /farms/:farmId/parcels/:parcelId/edit).
 *
 * Même décision que les fermes (option a, Phase 3) : formulaire de création
 * réutilisé en mode édition, pré-rempli. Le mode `edit` expose en plus les
 * 4 champs optionnels du CreateParcelDto (variété, débit, âge, densité).
 * Succès → retour au détail de la parcelle (replace).
 */
export function ParcelEditScreen() {
  const { farmId, parcelId } = useParams<{ farmId: string; parcelId: string }>();
  const navigate = useNavigate();

  const { parcel, status, refetch } = useParcel(parcelId);
  const { update, isUpdating, error, clearError } = useUpdateParcel();

  const backToParcel = () => navigate(`/farms/${farmId}/parcels/${parcelId}`);

  const handleSubmit = async (payload: Parameters<typeof update>[1]) => {
    if (!parcelId) {
      return;
    }

    const succeeded = await update(parcelId, payload);

    if (succeeded) {
      navigate(`/farms/${farmId}/parcels/${parcelId}`, { replace: true });
    }
  };

  return (
    <section className={styles.screen}>
      <div className={styles.topBar}>
        <Button variant="ghost" size="sm" aria-label="Retour" onClick={backToParcel}>
          <ArrowLeft aria-hidden="true" />
        </Button>

        {status === 'loading' ? (
          <Skeleton className={styles.skeletonTitle} />
        ) : (
          <h1 className={styles.title}>Modifier la parcelle</h1>
        )}
      </div>

      {status === 'loading' && (
        <div className={styles.skeletons}>
          <Skeleton className={styles.skeletonField} />
          <Skeleton className={styles.skeletonField} />
          <Skeleton className={styles.skeletonField} />
          <Skeleton className={styles.skeletonField} />
          <Skeleton className={styles.skeletonField} />
        </div>
      )}

      {status === 'error' && (
        <EmptyState
          icon={AlertCircle}
          title="Oups !"
          description="Impossible de charger cette parcelle."
          action={
            <Button variant="primary" className={styles.retryButton} onClick={refetch}>
              Réessayer
            </Button>
          }
        />
      )}

      {status === 'success' && parcel && (
        <ParcelForm
          mode="edit"
          initialValues={toFormValues(parcel)}
          submitting={isUpdating}
          serverError={error}
          onSubmit={(payload) => {
            clearError();
            void handleSubmit(payload);
          }}
          onCancel={backToParcel}
        />
      )}
    </section>
  );
}
