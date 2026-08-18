import { useEffect, useRef, useState } from 'react';
import { Radio } from 'lucide-react';

import { Button } from '../../ui/Button/Button';
import { Input } from '../../ui/Input/Input';
import { ErrorMessage } from '../../ui/ErrorMessage/ErrorMessage';
import { useAssociateSensor } from '../../../hooks/useParcels';

import styles from './AssociateSensorDialog.module.css';

export interface AssociateSensorDialogProps {
  open: boolean;
  parcelId: string;
  /** Fermeture (Annuler, Échap) — ignorée pendant la soumission. */
  onClose: () => void;
  /** Association réussie : l'appelant ferme la modale et rafraîchit ses données. */
  onAssociated: () => void;
}

/**
 * Modale d'association d'un capteur — maquette « ParcelDetail - Sensor
 * Modal » (164:35). Saisie du deviceId (ex. ESP32-OL-001) puis
 * POST /sensors/associate : idempotent si déjà sur la parcelle, réassignation
 * possible entre parcelles du même utilisateur, 403 anti-vol affiché dans
 * la modale qui reste ouverte.
 */
export function AssociateSensorDialog({
  open,
  parcelId,
  onClose,
  onAssociated,
}: AssociateSensorDialogProps) {
  const { associate, isAssociating, error, clearError } = useAssociateSensor();
  const [deviceId, setDeviceId] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setDeviceId('');
      clearError();
      dialogRef.current?.focus();
    }
  }, [open, clearError]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isAssociating) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, isAssociating, onClose]);

  if (!open) {
    return null;
  }

  const handleAssociate = async () => {
    if (deviceId.trim().length === 0 || isAssociating) {
      return;
    }

    const associated = await associate({ deviceId: deviceId.trim(), parcelId });
    if (associated) {
      onAssociated();
    }
  };

  return (
    <div className={styles.overlay}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="associate-sensor-title"
        tabIndex={-1}
        className={styles.dialog}
      >
        <span className={styles.icon} aria-hidden="true">
          <Radio size={24} />
        </span>

        <h2 id="associate-sensor-title" className={styles.title}>
          Associer un capteur
        </h2>
        <p className={styles.description}>Saisissez l'identifiant affiché sur</p>
        <p className={styles.description}>votre capteur ESP32.</p>

        <div className={styles.field}>
          <Input
            name="sensor-device-id"
            label="Identifiant du capteur"
            placeholder="ex. ESP32-OL-001"
            value={deviceId}
            state={deviceId ? 'filled' : 'default'}
            disabled={isAssociating}
            onChange={(event) => setDeviceId(event.target.value)}
          />
        </div>

        {error && <ErrorMessage message={error} />}

        <div className={styles.actions}>
          <Button variant="secondary" onClick={onClose} disabled={isAssociating}>
            Annuler
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleAssociate()}
            disabled={deviceId.trim().length === 0}
            loading={isAssociating}
          >
            Associer
          </Button>
        </div>
      </div>
    </div>
  );
}
