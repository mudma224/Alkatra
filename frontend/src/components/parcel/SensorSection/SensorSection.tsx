import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';

import { Button } from '../../ui/Button/Button';
import { Card } from '../../ui/Card/Card';
import { ConfirmDialog } from '../../ui/ConfirmDialog/ConfirmDialog';
import { AssociateSensorDialog } from '../AssociateSensorDialog/AssociateSensorDialog';
import { SensorListItem } from '../SensorListItem/SensorListItem';
import { SensorStatusPill } from '../SensorStatusPill/SensorStatusPill';
import { useDissociateSensor } from '../../../hooks/useParcels';
import type { Sensor } from '../../../types/parcel.types';

import styles from './SensorSection.module.css';

/** Au-delà, la card du détail passe en mode compact + lien vers la liste. */
const MAX_INLINE_SENSORS = 3;

export interface SensorSectionProps {
  farmId: string;
  parcelId: string;
  /** Capteurs de la parcelle (relation `sensors` de GET /parcels/:id). */
  sensors: Sensor[] | undefined;
  /** Association ou dissociation réussie : l'écran refetch la parcelle. */
  onSensorsChanged: () => void;
}

/**
 * Bloc « Capteurs » du ParcelDetailScreen — maquettes validées :
 * - « ParcelDetail - Multi Sensors » (188:28) : ≤ 3 capteurs, liste complète
 *   avec Dissocier par ligne, bouton « Associer » au-dessus ;
 * - « ParcelDetail - Many Sensors » (188:102) : > 3 capteurs, card compacte
 *   (3 max) + lien « Voir tous les capteurs (N) › » vers SensorListScreen ;
 * - « Sensor - Dissociate Modal » (188:29) : confirmation rassurante
 *   (mesures conservées, réassociation possible).
 */
export function SensorSection({ farmId, parcelId, sensors, onSensorsChanged }: SensorSectionProps) {
  const navigate = useNavigate();
  const { remove, isDissociating, error: dissociateError, clearError } = useDissociateSensor();

  const [isAssociateOpen, setIsAssociateOpen] = useState(false);
  const [sensorToRemove, setSensorToRemove] = useState<Sensor | null>(null);

  const list = sensors ?? [];
  const isCompact = list.length > MAX_INLINE_SENSORS;

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
      onSensorsChanged();
    }
  };

  return (
    <section className={styles.section}>
      <Button
        variant="outline"
        block
        iconLeft={<Plus aria-hidden="true" />}
        onClick={() => setIsAssociateOpen(true)}
      >
        Associer un capteur
      </Button>

      {list.length === 0 && (
        <Card className={styles.emptyCard}>
          <p className={styles.emptyText}>Aucun capteur associé</p>
        </Card>
      )}

      {list.length > 0 && (
        <Card className={styles.sensorsCard}>
          {isCompact ? (
            <>
              {list.slice(0, MAX_INLINE_SENSORS).map((sensor) => (
                <div key={sensor.id} className={styles.compactRow}>
                  <span className={styles.compactDeviceId}>{sensor.deviceId}</span>
                  <SensorStatusPill sensor={sensor} />
                </div>
              ))}
              <Button
                variant="ghost"
                className={styles.seeAll}
                onClick={() => navigate(`/farms/${farmId}/parcels/${parcelId}/sensors`)}
              >
                Voir tous les capteurs ({list.length}) ›
              </Button>
            </>
          ) : (
            list.map((sensor) => (
              <SensorListItem key={sensor.id} sensor={sensor} onDissociate={openRemoveModal} />
            ))
          )}
        </Card>
      )}

      <AssociateSensorDialog
        open={isAssociateOpen}
        parcelId={parcelId}
        onClose={() => setIsAssociateOpen(false)}
        onAssociated={() => {
          setIsAssociateOpen(false);
          onSensorsChanged();
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
    </section>
  );
}
