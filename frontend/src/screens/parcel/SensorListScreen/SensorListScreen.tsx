import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Plus, SearchX } from 'lucide-react';

import { Button } from '../../../components/ui/Button/Button';
import { Card } from '../../../components/ui/Card/Card';
import { EmptyState } from '../../../components/ui/EmptyState/EmptyState';
import { Input } from '../../../components/ui/Input/Input';
import { Skeleton } from '../../../components/ui/Skeleton/Skeleton';
import { ConfirmDialog } from '../../../components/ui/ConfirmDialog/ConfirmDialog';
import { AssociateSensorDialog } from '../../../components/parcel/AssociateSensorDialog/AssociateSensorDialog';
import { SensorListItem } from '../../../components/parcel/SensorListItem/SensorListItem';
import { useDissociateSensor, useParcel } from '../../../hooks/useParcels';
import { normalizeSearchOrder } from './sensorFilters';
import { getSensorStatus } from '../../../types/parcel.types';
import { normalizeSearch } from '../../../utils/format';
import type { Sensor } from '../../../types/parcel.types';

import styles from './SensorListScreen.module.css';

type StatusFilter = 'all' | 'active' | 'pending' | 'inactive' | 'failing';

const FILTER_LABELS: Record<StatusFilter, string> = {
  all: 'Tous',
  active: 'Actifs',
  pending: 'En attente',
  inactive: 'Désactivés',
  failing: 'Défaillants',
};

/**
 * Liste dédiée des capteurs d'une parcelle (route
 * /farms/:farmId/parcels/:parcelId/sensors) — maquette « SensorList -
 * Populated » (188:103). Recherche par deviceId (insensible casse/diacritiques,
 * comme les fermes) + filtre par statut (Actifs = a émis récemment ;
 * En attente = jamais vu ; Désactivés = silence > 2 h ; Défaillants =
 * silence > 24 h — seuils configurables côté farm-service). Tri : actifs
 * d'abord, défaillants en dernier.
 */
export function SensorListScreen() {
  const { farmId, parcelId } = useParams<{ farmId: string; parcelId: string }>();
  const navigate = useNavigate();

  const { parcel, status, refetch } = useParcel(parcelId);
  const { remove, isDissociating, error: dissociateError, clearError } = useDissociateSensor();

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [isAssociateOpen, setIsAssociateOpen] = useState(false);
  const [sensorToRemove, setSensorToRemove] = useState<Sensor | null>(null);

  const sensors = parcel?.sensors ?? [];

  const filtered = sensors
    .filter((sensor) => {
      if (filter === 'all') return true;
      return getSensorStatus(sensor) === filter;
    })
    .filter((sensor) => normalizeSearch(sensor.deviceId).includes(normalizeSearch(query)))
    .sort(normalizeSearchOrder);

  const backToParcel = () => navigate(`/farms/${farmId}/parcels/${parcelId}`);

  const openRemoveModal = (sensor: Sensor) => {
    clearError();
    setSensorToRemove(sensor);
  };

  const closeRemoveModal = () => {
    if (isDissociating) {
      return;
    }
    clearError();
    setSensorToRemove(null);
  };

  const handleConfirmRemove = async () => {
    if (!sensorToRemove) {
      return;
    }

    const succeeded = await remove(sensorToRemove.id);

    if (succeeded) {
      setSensorToRemove(null);
      refetch();
    }
  };

  const subtitle =
    status === 'success' && parcel
      ? `${parcel.name} · ${sensors.length} ${sensors.length === 1 ? 'capteur' : 'capteurs'}`
      : null;

  return (
    <section className={styles.screen}>
      <div className={styles.topBar}>
        <Button variant="ghost" size="sm" aria-label="Retour" onClick={backToParcel}>
          <ArrowLeft aria-hidden="true" />
        </Button>
        <h1 className={styles.title}>Capteurs</h1>
      </div>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}

      {status === 'loading' && (
        <div className={styles.skeletons}>
          <Skeleton className={styles.skeletonSearch} />
          <Skeleton className={styles.skeletonButton} />
          <Skeleton className={styles.skeletonCard} />
          <Skeleton className={styles.skeletonCard} />
        </div>
      )}

      {status === 'error' && (
        <EmptyState
          icon={AlertCircle}
          title="Oups !"
          description="Impossible de charger les capteurs."
          action={
            <Button variant="primary" className={styles.retryButton} onClick={refetch}>
              Réessayer
            </Button>
          }
        />
      )}

      {status === 'success' && parcel && (
        <>
          <Input
            variant="search"
            placeholder="Rechercher"
            value={query}
            onClear={() => setQuery('')}
            onChange={(event) => setQuery(event.target.value)}
          />

          <div className={styles.filters} role="group" aria-label="Filtrer par statut">
            {(Object.keys(FILTER_LABELS) as StatusFilter[]).map((value) => (
              <button
                key={value}
                type="button"
                className={filter === value ? styles.chipActive : styles.chip}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {FILTER_LABELS[value]}
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            block
            iconLeft={<Plus aria-hidden="true" />}
            onClick={() => setIsAssociateOpen(true)}
          >
            Associer un capteur
          </Button>

          {sensors.length === 0 ? (
            <Card className={styles.emptyCard}>
              <EmptyState
                icon={Plus}
                title="Aucun capteur"
                description="Associez un capteur pour suivre cette parcelle."
              />
            </Card>
          ) : filtered.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title="Aucun capteur trouvé"
              description="Modifiez votre recherche ou votre filtre."
            />
          ) : (
            <ul className={styles.list}>
              {filtered.map((sensor) => (
                <li key={sensor.id}>
                  <Card className={styles.sensorCard}>
                    <SensorListItem sensor={sensor} onDissociate={openRemoveModal} />
                  </Card>
                </li>
              ))}
            </ul>
          )}

          <AssociateSensorDialog
            open={isAssociateOpen}
            parcelId={parcel.id}
            onClose={() => setIsAssociateOpen(false)}
            onAssociated={() => {
              setIsAssociateOpen(false);
              refetch();
            }}
          />

          <ConfirmDialog
            open={sensorToRemove !== null}
            title="Dissocier ce capteur ?"
            description={
              sensorToRemove
                ? [
                    `${sensorToRemove.deviceId} sera retiré de cette parcelle.`,
                    'Les mesures déjà collectées sont conservées.',
                    'Vous pourrez le réassocier plus tard.',
                  ]
                : []
            }
            cancelLabel="Annuler"
            confirmLabel="Dissocier"
            busy={isDissociating}
            errorMessage={dissociateError}
            onCancel={closeRemoveModal}
            onConfirm={() => void handleConfirmRemove()}
          />
        </>
      )}
    </section>
  );
}
