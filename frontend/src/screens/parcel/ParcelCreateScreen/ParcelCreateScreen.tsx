import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

import { Button } from '../../../components/ui/Button/Button';
import { ParcelForm } from '../../../components/parcel/ParcelForm/ParcelForm';
import type { ParcelFormSubmitPayload } from '../../../components/parcel/ParcelForm/ParcelForm';
import { useCreateParcel } from '../../../hooks/useParcels';

import styles from './ParcelCreateScreen.module.css';

const EMPTY_VALUES = {
  name: '',
  area: '',
  cropType: '' as const,
  soilType: '' as const,
  irrigationMethod: '' as const,
  cropVariety: '',
  flowRate: '',
  treeAge: '',
  treeDensity: '',
};

/**
 * Création d'une parcelle (route /farms/:farmId/parcels/new).
 *
 * Maquettes Figma validées : « ParcelCreate » (5 champs requis),
 * « ParcelCreate - Validation Errors » et « ParcelCreate - Surface Error »
 * (message 422 du farm-service affiché sous Enregistrer).
 *
 * Succès → retour au détail de la ferme (replace : pas de retour navigateur
 * vers le formulaire).
 */
export function ParcelCreateScreen() {
  const { farmId } = useParams<{ farmId: string }>();
  const navigate = useNavigate();

  const { create, isCreating, error, clearError } = useCreateParcel();

  const backToFarm = () => navigate(`/farms/${farmId}`);

  const handleSubmit = async (payload: ParcelFormSubmitPayload) => {
    if (!farmId) {
      return;
    }

    const succeeded = await create({ ...payload, farmId });

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
        <h1 className={styles.title}>Nouvelle parcelle</h1>
      </div>

      <ParcelForm
        mode="create"
        initialValues={EMPTY_VALUES}
        submitting={isCreating}
        serverError={error}
        onSubmit={(payload) => {
          clearError();
          void handleSubmit(payload);
        }}
        onCancel={backToFarm}
      />
    </section>
  );
}
