import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowRight, Droplets, Plus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';

import { farmApi } from '../../../api/farm.api';
import { BackNavigation } from '../../../components/layout/BackNavigation/BackNavigation';
import { Button } from '../../../components/ui/Button/Button';
import { EmptyState } from '../../../components/ui/EmptyState/EmptyState';
import { Skeleton } from '../../../components/ui/Skeleton/Skeleton';
import type { Farm } from '../../../types/farm.types';

import styles from './RecommendationOverviewScreen.module.css';

type LoadStatus = 'loading' | 'success' | 'error';

/**
 * Entry screen for the shared navigation route `/recommendations`.
 * It reuses GET /farms and the parcels already embedded in that response;
 * no aggregate recommendation endpoint is invented.
 */
export function RecommendationOverviewScreen() {
  const navigate = useNavigate();
  const [farms, setFarms] = useState<Farm[]>([]);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    setStatus('loading');
    farmApi
      .list()
      .then((result) => {
        if (!cancelled) {
          setFarms(result);
          setStatus('success');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [reloadCount]);

  const refetch = useCallback(() => {
    setReloadCount((count) => count + 1);
  }, []);

  const parcelEntries = farms.flatMap((farm) =>
    (farm.parcels ?? []).map((parcel) => ({ farm, parcel })),
  );
  const firstFarm = farms[0];

  const handleCreate = () => {
    if (firstFarm) {
      navigate(`/farms/${firstFarm.id}/parcels/new`);
      return;
    }

    navigate('/farms/new');
  };

  return (
    <section className={styles.screen}>
      <BackNavigation label="Retour" />

      {status === 'loading' && (
        <div className={styles.skeletons} aria-label="Chargement des parcelles">
          <Skeleton className={styles.skeletonTitle} />
          <Skeleton className={styles.skeletonCard} />
          <Skeleton className={styles.skeletonRow} />
        </div>
      )}

      {status === 'error' && (
        <EmptyState
          icon={AlertCircle}
          title="Oups !"
          description="Impossible de charger vos parcelles."
          action={
            <Button variant="primary" onClick={refetch}>
              Réessayer
            </Button>
          }
        />
      )}

      {status === 'success' && parcelEntries.length === 0 && (
        <article className={styles.emptyCard}>
          <div className={styles.emptyHeading}>
            <h1>Aucune recommandation</h1>
            <span className={styles.dropIcon} aria-hidden="true">
              <Droplets />
            </span>
          </div>

          <div className={styles.emptyPanel}>
            <span className={styles.plusIcon} aria-hidden="true">
              <Plus />
            </span>
            <h2>{firstFarm ? 'Aucune parcelle' : 'Aucune ferme'}</h2>
            <p>
              {firstFarm
                ? "Créez votre première parcelle pour suivre l'irrigation."
                : 'Créez d’abord une ferme, puis ajoutez une parcelle.'}
            </p>
            <Button variant="primary" block onClick={handleCreate}>
              {firstFarm ? 'Ajouter une parcelle' : 'Ajouter une ferme'}
            </Button>
          </div>
        </article>
      )}

      {status === 'success' && parcelEntries.length > 0 && (
        <>
          <div className={styles.heading}>
            <h1>Recommandations</h1>
            <p>Choisissez une parcelle pour consulter sa recommandation.</p>
          </div>

          <ul className={styles.parcelList}>
            {parcelEntries.map(({ farm, parcel }) => (
              <li key={parcel.id}>
                <Link
                  className={styles.parcelLink}
                  to={`/farms/${farm.id}/parcels/${parcel.id}/recommendation`}
                >
                  <span>
                    <strong>{parcel.name}</strong>
                    <small>{farm.name}</small>
                  </span>
                  <ArrowRight aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
