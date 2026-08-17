import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Plus } from 'lucide-react';

import { Button } from '../../../components/ui/Button/Button';
import { Card } from '../../../components/ui/Card/Card';
import { EmptyState } from '../../../components/ui/EmptyState/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton/Skeleton';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog/ConfirmDialog';
import { useDeleteFarm, useFarm } from '../../../hooks/useFarms';
import { formatAreaHa, formatDateFr } from '../../../utils/format';

import styles from './FarmDetailScreen.module.css';

/**
 * Détail d'une ferme (route /farms/:farmId).
 *
 * Maquettes Figma validées :
 * - « FarmDetail » (83:71) : barre retour + nom, Info Card
 *   (Région / Surface totale / Créée le), Modifier + Supprimer,
 *   section Parcelles à l'état vide (Phase 4).
 * - « FarmDetail - Delete Modal » (83:93) : confirmation destructive.
 *
 * La suppression appelle DELETE /farms/:id ; le farm-service renvoie 409
 * si la ferme possède encore des parcelles — le message backend est alors
 * affiché dans la modale.
 */
export function FarmDetailScreen() {
  const { farmId } = useParams<{ farmId: string }>();
  const navigate = useNavigate();

  const { farm, status, refetch } = useFarm(farmId);
  const { remove, isDeleting, error: deleteError, clearError } = useDeleteFarm();

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const backToFarms = () => navigate('/farms');

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
    if (!farmId) {
      return;
    }

    const succeeded = await remove(farmId);

    if (succeeded) {
      navigate('/farms', { replace: true });
    }
  };

  return (
    <section className={styles.screen}>
      <div className={styles.topBar}>
        <Button variant="ghost" size="sm" aria-label="Retour" onClick={backToFarms}>
          <ArrowLeft aria-hidden="true" />
        </Button>

        {status === 'loading' ? (
          <Skeleton className={styles.skeletonTitle} />
        ) : (
          <h1 className={styles.title}>{farm?.name}</h1>
        )}
      </div>

      {status === 'loading' && (
        <div className={styles.skeletons}>
          <Skeleton className={styles.skeletonCard} />
          <Skeleton className={styles.skeletonActions} />
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
        <>
          <Card className={styles.infoCard}>
            <dl className={styles.infoRows}>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Région</dt>
                <dd className={styles.infoValue}>{farm.region ?? '—'}</dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Surface totale</dt>
                <dd className={styles.infoValue}>{formatAreaHa(farm.totalAreaHa)} ha</dd>
              </div>
              <div className={styles.infoRow}>
                <dt className={styles.infoLabel}>Créée le</dt>
                <dd className={styles.infoValue}>{formatDateFr(farm.createdAt)}</dd>
              </div>
            </dl>
          </Card>

          <div className={styles.actions}>
            {/*
             * Option (a) validée : le formulaire de création est réutilisé en
             * mode édition (FarmEditScreen, maquette FarmCreate pré-remplie).
             */}
            <Button
              variant="outline"
              className={styles.actionButton}
              onClick={() => navigate(`/farms/${farmId}/edit`)}
            >
              Modifier
            </Button>
            <Button
              variant="destructive"
              className={styles.actionButton}
              onClick={openDeleteModal}
            >
              Supprimer
            </Button>
          </div>

          <h2 className={styles.sectionTitle}>Parcelles</h2>
          {/*
           * Les parcelles ne sont pas encore gérées (Phase 4) : la maquette
           * FarmDetail ne définit que cet état vide.
           */}
          <Card className={styles.parcelsCard}>
            <EmptyState
              icon={Plus}
              title="Aucune parcelle"
              description="Bientôt disponible (Phase 4)"
            />
          </Card>

          <ConfirmDialog
            open={isDeleteModalOpen}
            title="Supprimer cette ferme ?"
            description={[
              'Cette action est irréversible.',
              'Toutes les données seront perdues.',
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
