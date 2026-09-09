import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

import { Button } from '../../../components/ui/Button/Button';
import { FarmForm } from '../../../components/farm/FarmForm/FarmForm';
import { useCreateFarm } from '../../../hooks/useFarms';
import type { CreateFarmPayload } from '../../../types/farm.types';

import styles from './FarmCreateScreen.module.css';

/**
 * Création d'une ferme (route /farms/new).
 *
 * Maquettes Figma validées :
 * - « FarmCreate » (83:55) : trois champs + Enregistrer (primary) / Annuler (secondary).
 * - « FarmCreate - Loading » (111:47) : soumission en cours (spinner sur Enregistrer).
 * - « FarmCreate - Validation Errors » (123:61) : gérées par le FarmForm partagé.
 *
 * Succès → retour à la liste /farms (la nouvelle ferme y apparaît), en
 * `replace` pour éviter un retour navigateur vers le formulaire.
 */
export function FarmCreateScreen() {
  const navigate = useNavigate();
  const { create, isCreating } = useCreateFarm();
  const [submitError, setSubmitError] = useState(false);

  const cancel = () => navigate('/farms', { replace: true });

  const handleSubmit = async (payload: CreateFarmPayload) => {
    setSubmitError(false);

    const succeeded = await create(payload);

    if (succeeded) {
      navigate('/farms', { replace: true });
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
          onClick={cancel}
          disabled={isCreating}
        >
          <ArrowLeft aria-hidden="true" />
        </Button>

        <h1 className={styles.title}>Nouvelle ferme</h1>
      </div>

      <FarmForm
        initialValues={{ name: '', area: '', region: '' }}
        submitting={isCreating}
        serverError={submitError ? "Impossible d'enregistrer la ferme. Réessayez." : null}
        onSubmit={(payload) => void handleSubmit(payload)}
        onCancel={cancel}
      />
    </section>
  );
}
