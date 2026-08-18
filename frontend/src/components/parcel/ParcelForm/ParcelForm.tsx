import { FormEvent, useState } from 'react';

import { Button } from '../../ui/Button/Button';
import { Input } from '../../ui/Input/Input';
import { Select } from '../../ui/Select/Select';
import { ErrorMessage } from '../../ui/ErrorMessage/ErrorMessage';
import { parseDecimal } from '../../../utils/format';
import {
  CROP_TYPE_OPTIONS,
  IRRIGATION_METHOD_OPTIONS,
  SOIL_TYPE_OPTIONS,
} from '../../../types/parcel.types';
import type {
  CropType,
  IrrigationMethod,
  SoilType,
} from '../../../types/parcel.types';

import styles from './ParcelForm.module.css';

/** Messages de validation — textes des maquettes « ParcelCreate - Validation Errors »
 *  et « ParcelCreate - Surface Error » (le message 422 vient du backend via serverError). */
const NAME_REQUIRED_ERROR = 'Le nom de la parcelle est obligatoire.';
const AREA_INVALID_ERROR = 'La surface doit être supérieure à 0.';
const CROP_REQUIRED_ERROR = 'La culture est obligatoire.';
const SOIL_REQUIRED_ERROR = 'Le type de sol est obligatoire.';
const IRRIGATION_REQUIRED_ERROR = "La méthode d'irrigation est obligatoire.";
const FLOW_INVALID_ERROR = 'Le débit doit être un nombre positif.';
const TREE_AGE_INVALID_ERROR = "L'âge doit être un nombre entier positif.";
const TREE_DENSITY_INVALID_ERROR = 'La densité doit être un nombre entier positif.';

export interface ParcelFormValues {
  name: string;
  area: string;
  cropType: CropType | '';
  soilType: SoilType | '';
  irrigationMethod: IrrigationMethod | '';
  cropVariety: string;
  flowRate: string;
  treeAge: string;
  treeDensity: string;
}

/** Payload émis par le formulaire (la ferme est ajoutée par l'écran de création). */
export interface ParcelFormSubmitPayload {
  name: string;
  areaHa: number;
  cropType: CropType;
  soilType: SoilType;
  irrigationMethod: IrrigationMethod;
  cropVariety?: string;
  flowRateM3h?: number;
  treeAgeYears?: number;
  treeDensityPerHa?: number;
}

export interface ParcelFormProps {
  initialValues: ParcelFormValues;
  /**
   * `edit` affiche les 4 champs optionnels du CreateParcelDto (variété, débit,
   * âge, densité) — choix validé : création minimale, édition complète.
   */
  mode: 'create' | 'edit';
  submitting: boolean;
  /** Message d'erreur serveur (ex. 422 dépassement de surface) sous Enregistrer. */
  serverError: string | null;
  onSubmit: (payload: ParcelFormSubmitPayload) => void;
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

function validateFlowRate(flowRate: string): string | null {
  if (flowRate.trim().length === 0) {
    return null;
  }

  return parseDecimal(flowRate) >= 0 ? null : FLOW_INVALID_ERROR;
}

function validateTreeAge(treeAge: string): string | null {
  if (treeAge.trim().length === 0) {
    return null;
  }

  const parsed = parseDecimal(treeAge);
  return Number.isInteger(parsed) && parsed >= 0 ? null : TREE_AGE_INVALID_ERROR;
}

function validateTreeDensity(treeDensity: string): string | null {
  if (treeDensity.trim().length === 0) {
    return null;
  }

  const parsed = parseDecimal(treeDensity);
  return Number.isInteger(parsed) && parsed >= 0 ? null : TREE_DENSITY_INVALID_ERROR;
}

/**
 * Formulaire de parcelle partagé par la création (ParcelCreateScreen) et
 * l'édition (ParcelEditScreen) — maquettes « ParcelCreate » (création 5 champs)
 * et « ParcelCreate - Validation Errors ».
 *
 * Règles identiques à FarmForm : erreurs affichées au blur puis ré-évaluées
 * en direct, bouton Enregistrer désactivé tant que le formulaire est invalide,
 * virgule décimale acceptée. Le message 422 du backend (somme des surfaces >
 * surface de la ferme) est affiché via `serverError`.
 */
export function ParcelForm({
  initialValues,
  mode,
  submitting,
  serverError,
  onSubmit,
  onCancel,
}: ParcelFormProps) {
  const [values, setValues] = useState<ParcelFormValues>(initialValues);
  const [touched, setTouched] = useState({
    name: false,
    area: false,
    cropType: false,
    soilType: false,
    irrigationMethod: false,
    flowRate: false,
    treeAge: false,
    treeDensity: false,
  });

  const nameError = touched.name ? validateName(values.name) : null;
  const areaError = touched.area ? validateArea(values.area) : null;
  const cropError = touched.cropType && !values.cropType ? CROP_REQUIRED_ERROR : null;
  const soilError = touched.soilType && !values.soilType ? SOIL_REQUIRED_ERROR : null;
  const irrigationError =
    touched.irrigationMethod && !values.irrigationMethod ? IRRIGATION_REQUIRED_ERROR : null;
  const flowError = mode === 'edit' && touched.flowRate ? validateFlowRate(values.flowRate) : null;
  const treeAgeError = mode === 'edit' && touched.treeAge ? validateTreeAge(values.treeAge) : null;
  const treeDensityError =
    mode === 'edit' && touched.treeDensity ? validateTreeDensity(values.treeDensity) : null;

  const isFormValid =
    validateName(values.name) === null &&
    validateArea(values.area) === null &&
    values.cropType !== '' &&
    values.soilType !== '' &&
    values.irrigationMethod !== '' &&
    validateFlowRate(values.flowRate) === null &&
    validateTreeAge(values.treeAge) === null &&
    validateTreeDensity(values.treeDensity) === null;

  const setField = <K extends keyof ParcelFormValues>(field: K, value: ParcelFormValues[K]) => {
    setValues((current) => ({ ...current, [field]: value }));
  };

  const blurField = (field: keyof typeof touched) => {
    setTouched((current) => ({ ...current, [field]: true }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!isFormValid || submitting) {
      return;
    }

    onSubmit({
      name: values.name.trim(),
      areaHa: parseDecimal(values.area),
      /* Casts sûrs : isFormValid garantit que les selects ne sont pas vides. */
      cropType: values.cropType as CropType,
      soilType: values.soilType as SoilType,
      irrigationMethod: values.irrigationMethod as IrrigationMethod,
      cropVariety: values.cropVariety.trim() || undefined,
      flowRateM3h: values.flowRate.trim() ? parseDecimal(values.flowRate) : undefined,
      treeAgeYears: values.treeAge.trim() ? parseDecimal(values.treeAge) : undefined,
      treeDensityPerHa: values.treeDensity.trim() ? parseDecimal(values.treeDensity) : undefined,
    });
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <Input
        name="parcel-name"
        label="Nom de la parcelle"
        placeholder="Parcelle Nord"
        maxLength={150}
        value={values.name}
        state={nameError ? 'error' : values.name ? 'filled' : 'default'}
        errorMessage={nameError ?? undefined}
        disabled={submitting}
        onChange={(event) => setField('name', event.target.value)}
        onBlur={() => blurField('name')}
      />
      {nameError && <ErrorMessage id="parcel-name-error" message={nameError} />}

      <Input
        name="parcel-area"
        label="Surface (ha)"
        placeholder="ex. 2.5"
        inputMode="decimal"
        value={values.area}
        state={areaError ? 'error' : values.area ? 'filled' : 'default'}
        errorMessage={areaError ?? undefined}
        disabled={submitting}
        onChange={(event) => setField('area', event.target.value)}
        onBlur={() => blurField('area')}
      />
      {areaError && <ErrorMessage id="parcel-area-error" message={areaError} />}

      <Select
        name="parcel-crop"
        label="Culture"
        placeholder="Choisir une culture"
        options={CROP_TYPE_OPTIONS}
        value={values.cropType}
        state={cropError ? 'error' : values.cropType ? 'filled' : 'default'}
        errorMessage={cropError ?? undefined}
        disabled={submitting}
        onChange={(value) => setField('cropType', value as CropType)}
        onBlur={() => blurField('cropType')}
      />
      {cropError && <ErrorMessage id="parcel-crop-error" message={cropError} />}

      <Select
        name="parcel-soil"
        label="Type de sol"
        placeholder="Choisir un type de sol"
        options={SOIL_TYPE_OPTIONS}
        value={values.soilType}
        state={soilError ? 'error' : values.soilType ? 'filled' : 'default'}
        errorMessage={soilError ?? undefined}
        disabled={submitting}
        onChange={(value) => setField('soilType', value as SoilType)}
        onBlur={() => blurField('soilType')}
      />
      {soilError && <ErrorMessage id="parcel-soil-error" message={soilError} />}

      <Select
        name="parcel-irrigation"
        label="Méthode d'irrigation"
        placeholder="Choisir une méthode"
        options={IRRIGATION_METHOD_OPTIONS}
        value={values.irrigationMethod}
        state={irrigationError ? 'error' : values.irrigationMethod ? 'filled' : 'default'}
        errorMessage={irrigationError ?? undefined}
        disabled={submitting}
        onChange={(value) => setField('irrigationMethod', value as IrrigationMethod)}
        onBlur={() => blurField('irrigationMethod')}
      />
      {irrigationError && (
        <ErrorMessage id="parcel-irrigation-error" message={irrigationError} />
      )}

      {mode === 'edit' && (
        <>
          <Input
            name="parcel-variety"
            label="Variété (optionnel)"
            placeholder="ex. Picholine marocaine"
            maxLength={100}
            value={values.cropVariety}
            state={values.cropVariety ? 'filled' : 'default'}
            disabled={submitting}
            onChange={(event) => setField('cropVariety', event.target.value)}
          />

          <Input
            name="parcel-flow"
            label="Débit d'irrigation m³/h (optionnel)"
            placeholder="ex. 3.2"
            inputMode="decimal"
            value={values.flowRate}
            state={flowError ? 'error' : values.flowRate ? 'filled' : 'default'}
            errorMessage={flowError ?? undefined}
            disabled={submitting}
            onChange={(event) => setField('flowRate', event.target.value)}
            onBlur={() => blurField('flowRate')}
          />
          {flowError && <ErrorMessage id="parcel-flow-error" message={flowError} />}

          <Input
            name="parcel-tree-age"
            label="Âge des arbres, années (optionnel)"
            placeholder="ex. 12"
            inputMode="numeric"
            value={values.treeAge}
            state={treeAgeError ? 'error' : values.treeAge ? 'filled' : 'default'}
            errorMessage={treeAgeError ?? undefined}
            disabled={submitting}
            onChange={(event) => setField('treeAge', event.target.value)}
            onBlur={() => blurField('treeAge')}
          />
          {treeAgeError && <ErrorMessage id="parcel-tree-age-error" message={treeAgeError} />}

          <Input
            name="parcel-tree-density"
            label="Densité arbres/ha (optionnel)"
            placeholder="ex. 100"
            inputMode="numeric"
            value={values.treeDensity}
            state={treeDensityError ? 'error' : values.treeDensity ? 'filled' : 'default'}
            errorMessage={treeDensityError ?? undefined}
            disabled={submitting}
            onChange={(event) => setField('treeDensity', event.target.value)}
            onBlur={() => blurField('treeDensity')}
          />
          {treeDensityError && (
            <ErrorMessage id="parcel-tree-density-error" message={treeDensityError} />
          )}
        </>
      )}

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
