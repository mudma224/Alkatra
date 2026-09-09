import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AxiosError } from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ParcelCreateScreen } from './ParcelCreateScreen';
import { parcelApi } from '../../../api/parcel.api';

vi.mock('../../../api/parcel.api', () => ({
  parcelApi: { listByFarm: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
  sensorApi: { associate: vi.fn(), listByParcel: vi.fn() },
}));

const mockedCreate = vi.mocked(parcelApi.create);

function renderCreateScreen() {
  return render(
    <MemoryRouter initialEntries={['/farms/farm-1/parcels/new']}>
      <Routes>
        <Route path="/farms/:farmId" element={<div>Farm detail page</div>} />
        <Route path="/farms/:farmId/parcels/new" element={<ParcelCreateScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

function fillValidForm() {
  fireEvent.change(screen.getByLabelText('Nom de la parcelle'), {
    target: { value: 'Parcelle Nord' },
  });
  fireEvent.change(screen.getByLabelText('Surface (ha)'), { target: { value: '2,5' } });
  fireEvent.change(screen.getByLabelText('Culture'), { target: { value: 'olive' } });
  fireEvent.change(screen.getByLabelText('Type de sol'), { target: { value: 'clay' } });
  fireEvent.change(screen.getByLabelText("Méthode d'irrigation"), { target: { value: 'drip' } });
}

/** Erreur Axios mimant le 422 de dépassement de surface du farm-service. */
function makeSurfaceError(): AxiosError {
  return new AxiosError('Unprocessable Entity', AxiosError.ERR_BAD_REQUEST, undefined, undefined, {
    data: {
      statusCode: 422,
      errorCode: 'UNPROCESSABLE_ENTITY',
      message:
        'La surface totale des parcelles (14.5 ha) dépasse la surface de la ferme (12.50 ha).',
      timestamp: '2026-08-18T10:00:00.000Z',
      path: '/api/v1/parcels',
      method: 'POST',
    },
    status: 422,
    statusText: 'Unprocessable Entity',
    headers: {},
    config: {} as never,
  });
}

describe('ParcelCreateScreen', () => {
  beforeEach(() => {
    mockedCreate.mockReset();
  });

  it('keeps Enregistrer disabled while the form is invalid and shows blur errors', () => {
    renderCreateScreen();

    const submit = screen.getByRole('button', { name: 'Enregistrer' });
    expect(submit).toBeDisabled();

    fireEvent.blur(screen.getByLabelText('Nom de la parcelle'));
    fireEvent.blur(screen.getByLabelText('Surface (ha)'));

    expect(screen.getByText('Le nom de la parcelle est obligatoire.')).toBeInTheDocument();
    expect(screen.getByText('La surface doit être supérieure à 0.')).toBeInTheDocument();

    fireEvent.blur(screen.getByLabelText('Culture'));
    expect(screen.getByText('La culture est obligatoire.')).toBeInTheDocument();
  });

  it('does not show the optional fields in create mode', () => {
    renderCreateScreen();

    expect(screen.queryByLabelText(/Variété/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Débit/)).not.toBeInTheDocument();
  });

  it('submits the exact CreateParcelPayload (virgule décimale) and navigates to the farm', async () => {
    mockedCreate.mockResolvedValueOnce({} as never);

    renderCreateScreen();
    fillValidForm();

    const submit = screen.getByRole('button', { name: 'Enregistrer' });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);

    await waitFor(() => expect(screen.getByText('Farm detail page')).toBeInTheDocument());
    expect(mockedCreate).toHaveBeenCalledTimes(1);
    expect(mockedCreate).toHaveBeenCalledWith({
      farmId: 'farm-1',
      name: 'Parcelle Nord',
      areaHa: 2.5,
      cropType: 'olive',
      soilType: 'clay',
      irrigationMethod: 'drip',
      cropVariety: undefined,
      flowRateM3h: undefined,
      treeAgeYears: undefined,
      treeDensityPerHa: undefined,
    });
  });

  it('shows the backend 422 surface message and stays on the form', async () => {
    mockedCreate.mockRejectedValueOnce(makeSurfaceError());

    renderCreateScreen();
    fillValidForm();

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(
        screen.getByText(/La surface totale des parcelles \(14\.5 ha\) dépasse/),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText('Farm detail page')).not.toBeInTheDocument();
  });

  it('goes back to the farm on Annuler without calling the API', () => {
    renderCreateScreen();

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.getByText('Farm detail page')).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });
});
