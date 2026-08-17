import { FormEvent, useState } from 'react';

import { Button } from '../../ui/Button/Button';
import { Input } from '../../ui/Input/Input';
import { ErrorMessage } from '../../ui/ErrorMessage/ErrorMessage';
import { parseDecimal } from '../../../utils/format';
import type { CreateFarmPayload } from '../../../types/farm.types';

import styles from './FarmForm.module.css';

/** Messages de validation — textes exacts de la maquette « FarmCreate - Validation Errors » (123:61). */
const NAME_REQUIRED_ERROR = 'Le nom de la ferme est obligatoire.';
const AREA_INVALID_ERROR = 'La surface doit être supérieure à 0.';

export interface FarmFormValues {
  name: string;
  area: string;
  region: string;
}

export interface FarmFormProps {
  /** Valeurs initiales des champs (création : champs vides ; édition : ferme existante). */
  initialValues: FarmFormValues;
  /** Requête en cours (spinner sur Enregistrer, champs verrouillés). */
  submitting: boolean;
  /** Message d'erreur serveur à afficher sous le bouton (null si aucun). */
  serverError: string | null;
  /** Appelé uniquement avec un payload valide (CreateFarmDto : name, totalAreaHa, region?). */
  onSubmit: (payload: CreateFarmPayload) => void;
  /** Bouton « Annuler » — retour à l'appelant (liste ou détail). */
  onCancel: () => void;
}

function validateName(name: string): string | null {
  return name.trim().length === 0 ? NAME_REQUIRED_ERROR : null;
}

function validateArea(area: string): string | null {
  if (area.trim().length === 0) {
    return AREA_INVALID_ERROR;
  }

  return parseDecimal(area) > 0 ? null : AREA_INVALID_ERROR;
}

/**
 * Formulaire de ferme partagé par la création (FarmCreateScreen) et l'édition
 * (FarmEditScreen — option a validée : maquette « FarmCreate » (83:55)
 * réutilisée en mode édition, pré-remplie).
 *
 * Règles de validation (maquette 123:61) : erreurs affichées au blur d'un champ
 * puis ré-évaluées en direct ; bouton « Enregistrer » désactivé tant que le
 * formulaire est invalide. La virgule décimale est acceptée (« 12,5 » → 12.5).
 */
export function FarmForm({
  initialValues,
  submitting,
  serverError,
  onSubmit,
  onCancel,
}: FarmFormProps) {
  const [name, setName] = useState(initialValues.name);
  const [area, setArea] = useState(initialValues.area);
  const [region, setRegion] = useState(initialValues.region);
  const [touched, setTouched] = useState<{ name: boolean; area: boolean }>({
    name: false,
    area: false,
  });

  const nameError = touched.name ? validateName(name) : null;
  const areaError = touched.area ? validateArea(area) : null;
  const isFormValid = validateName(name) === null && validateArea(area) === null;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isFormValid || submitting) {
      return;
    }

    onSubmit({
      name: name.trim(),
      totalAreaHa: parseDecimal(area),
      region: region.trim() || undefined,
    });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <Input
        name="farm-name"
        label="Nom de la ferme"
        placeholder="Ferme Aït Amira"
        maxLength={150}
        value={name}
        state={nameError ? 'error' : name ? 'filled' : 'default'}
        errorMessage={nameError ?? undefined}
        disabled={submitting}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => setTouched((current) => ({ ...current, name: true }))}
      />
      {nameError && <ErrorMessage id="farm-name-error" message={nameError} />}

      <Input
        name="farm-area"
        label="Surface totale (ha)"
        placeholder="ex. 12.5"
        inputMode="decimal"
        value={area}
        state={areaError ? 'error' : area ? 'filled' : 'default'}
        errorMessage={areaError ?? undefined}
        disabled={submitting}
        onChange={(event) => setArea(event.target.value)}
        onBlur={() => setTouched((current) => ({ ...current, area: true }))}
      />
      {areaError && <ErrorMessage id="farm-area-error" message={areaError} />}

      <Input
        name="farm-region"
        label="Région (optionnel)"
        placeholder="ex. Marrakech"
        maxLength={100}
        value={region}
        state={region ? 'filled' : 'default'}
        disabled={submitting}
        onChange={(event) => setRegion(event.target.value)}
      />

      <Button
        type="submit"
        variant="primary"
        block
        disabled={!isFormValid}
        loading={submitting}
      >
        Enregistrer
      </Button>

      {serverError && <ErrorMessage message={serverError} />}

      <Button
        type="button"
        variant="secondary"
        block
        onClick={onCancel}
        disabled={submitting}
      >
        Annuler
      </Button>
    </form>
  );
}
