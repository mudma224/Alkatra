import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft } from 'lucide-react';

import { Button } from '../../../components/ui/Button/Button';
import { Card } from '../../../components/ui/Card/Card';
import { EmptyState } from '../../../components/ui/EmptyState/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton/Skeleton';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog/ConfirmDialog';
import { SensorSection } from '../../../components/parcel/SensorSection/SensorSection';
import { useDeleteParcel, useParcel } from '../../../hooks/useParcels';
import { formatAreaHa, formatDateFr } from '../../../utils/format';
import {
  CROP_TYPE_LABELS,
  IRRIGATION_METHOD_LABELS,
  SOIL_TYPE_LABELS,
} from '../../../types/parcel.types';

import styles from './ParcelDetailScreen.module.css';

/**
 * Détail d'une parcelle (route /farms/:farmId/parcels/:parcelId).
 *
 * Maquettes Figma validées :
 * - « ParcelDetail » : titre + sous-titre ferme, Info Card 5 lignes
 *   (Culture / Surface / Type de sol / Irrigation / Créée le), CTA
 *   « Voir la recommandation du jour » (Phase 5), card Capteur, Modifier /
 *   Supprimer.
 * - « ParcelDetail - Sensor Modal » : association capteur (SensorSection).
 * - « ParcelDetail - Delete Modal » : confirmation destructive — les capteurs
 *   associés sont supprimés en cascade par la base.
 */
export function ParcelDetailScreen() {
  const { farmId, parcelId } = useParams<{ farmId: string; parcelId: string }>();
  const navigate = useNavigate();

  const { parcel, status, refetch } = useParcel(parcelId);
  const { remove, isDeleting, error: deleteError, clearError } = useDeleteParcel();

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const backToFarm = () => navigate(`/farms/${farmId}`);

  const openDeleteModal = () => {
    clearError();
    setIsDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    if (isDeleting) {
      return;
    }
    clearError();
    setIsDeleteModalOpen(false);
  };

  const handleConfirmDelete = async () => {
    if (!parcelId) {
      return;
    }

    const succeeded = await remove(parcelId);

    if (succeeded) {
      navigate(`/farms/${farmId}`, { replace: true });
    }
  };

  return (
    <section className={styles.screen}>
      <div className={styles.topBar}>
        <Button variant="ghost" size="sm" aria-label="Retour" onClick={backToFarm}>
          <ArrowLeft aria-hidden="true" />
        </Button>

        {status === 'loading' ? (
          <Skeleton className={styles.skeletonTitle} />
        ) : (
          <div className={styles.heading}>
            <h1 className={styles.title}>{parcel?.name}</h1>
            {parcel?.farm && <p className={styles.subtitle}>{parcel.farm.name}</p>}
          </div>
        )}
      </div>

      {status === 'loading' && (
        <div className={styles.skeletons}>
          <Skeleton className={styles.skeletonCard} />
          <Skeleton className={styles.skeletonActions} />
          <Skeleton className={styles.skeletonCard} />
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
        <>
          <Card className={styles.infoCard}>
            <dl className={styles.infoRows}>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Culture</dt>
                <dd className={styles.infoValue}>{CROP_TYPE_LABELS[parcel.cropType]}</dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Surface</dt>
                <dd className={styles.infoValue}>{formatAreaHa(parcel.areaHa)} ha</dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Type de sol</dt>
                <dd className={styles.infoValue}>{SOIL_TYPE_LABELS[parcel.soilType]}</dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Irrigation</dt>
                <dd className={styles.infoValue}>
                  {IRRIGATION_METHOD_LABELS[parcel.irrigationMethod]}
                </dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Créée le</dt>
                <dd className={styles.infoValue}>{formatDateFr(parcel.createdAt)}</dd>
              </div>
            </dl>
          </Card>

          <Button
            variant="primary"
            block
            onClick={() => navigate(`/farms/${farmId}/parcels/${parcelId}/recommendation`)}
          >
            Voir la recommandation du jour
          </Button>

          <SensorSection
            farmId={parcel.farmId}
            parcelId={parcel.id}
            sensors={parcel.sensors}
            onSensorsChanged={refetch}
          />

          <div className={styles.actions}>
            <Button
              variant="outline"
              className={styles.actionButton}
              onClick={() => navigate(`/farms/${farmId}/parcels/${parcelId}/edit`)}
            >
              Modifier
            </Button>
            <Button variant="destructive" className={styles.actionButton} onClick={openDeleteModal}>
              Supprimer
            </Button>
          </div>

          <ConfirmDialog
            open={isDeleteModalOpen}
            title="Supprimer cette parcelle ?"
            description={[
              'Cette action est irréversible.',
              'Les capteurs associés seront supprimés.',
            ]}
            cancelLabel="Annuler"
            confirmLabel="Supprimer"
            busy={isDeleting}
            errorMessage={deleteError}
            onCancel={closeDeleteModal}
            onConfirm={() => void handleConfirmDelete()}
          />
        </>
      )}
    </section>
  );
}
