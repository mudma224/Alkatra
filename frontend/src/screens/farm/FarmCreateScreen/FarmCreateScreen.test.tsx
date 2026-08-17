import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FarmCreateScreen } from './FarmCreateScreen';
import { farmApi } from '../../../api/farm.api';

vi.mock('../../../api/farm.api', () => ({
  farmApi: { list: vi.fn(), get: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() },
}));

const mockedCreate = vi.mocked(farmApi.create);

function renderCreateScreen() {
  return render(
    <MemoryRouter initialEntries={['/farms/new']}>
      <Routes>
        <Route path="/farms" element={<div>Farms page</div>} />
        <Route path="/farms/new" element={<FarmCreateScreen />} />
      </Routes>
    </MemoryRouter>,
  );
}

function fillField(label: string, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

function blurField(label: string) {
  fireEvent.blur(screen.getByLabelText(label));
}

function fillValidForm() {
  fillField('Nom de la ferme', 'Ferme Aït Amira');
  fillField('Surface totale (ha)', '12,5');
  fillField('Région (optionnel)', 'Marrakech');
}

describe('FarmCreateScreen', () => {
  beforeEach(() => {
    mockedCreate.mockReset();
  });

  it('disables Enregistrer while the form is invalid', () => {
    renderCreateScreen();

    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeEnabled();
  });

  it('enables Enregistrer once name and area are valid', () => {
    renderCreateScreen();

    fillValidForm();

    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  });

  it('shows the required-name error after blurring an empty name (maquette 123:61)', () => {
    renderCreateScreen();

    blurField('Nom de la ferme');

    expect(
      screen.getByText('Le nom de la ferme est obligatoire.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  });

  it('shows the area error for a zero surface (maquette 123:61)', () => {
    renderCreateScreen();

    fillField('Nom de la ferme', 'Ferme Aït Amira');
    fillField('Surface totale (ha)', '0');
    blurField('Surface totale (ha)');

    expect(screen.getByText('La surface doit être supérieure à 0.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  });

  it('clears the name error as soon as the user fixes the field', () => {
    renderCreateScreen();

    blurField('Nom de la ferme');
    expect(screen.getByText('Le nom de la ferme est obligatoire.')).toBeInTheDocument();

    fillField('Nom de la ferme', 'Ferme Aït Amira');

    expect(
      screen.queryByText('Le nom de la ferme est obligatoire.'),
    ).not.toBeInTheDocument();
  });

  it('submits the CreateFarmDto payload (decimal comma tolerated) and navigates to /farms', async () => {
    mockedCreate.mockResolvedValueOnce({
      id: 'farm-1',
      ownerId: 'user-1',
      name: 'Ferme Aït Amira',
      totalAreaHa: 12.5,
      region: 'Marrakech',
      location: null,
      createdAt: '2026-08-12T10:00:00.000Z',
      updatedAt: '2026-08-12T10:00:00.000Z',
    });

    renderCreateScreen();
    fillValidForm();

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith({
        name: 'Ferme Aït Amira',
        totalAreaHa: 12.5,
        region: 'Marrakech',
      }),
    );
    await waitFor(() => expect(screen.getByText('Farms page')).toBeInTheDocument());
  });

  it('omits region from the payload when left empty', async () => {
    mockedCreate.mockResolvedValueOnce({
      id: 'farm-1',
      ownerId: 'user-1',
      name: 'Ferme Aït Amira',
      totalAreaHa: 5,
      region: null,
      location: null,
      createdAt: '2026-08-12T10:00:00.000Z',
      updatedAt: '2026-08-12T10:00:00.000Z',
    });

    renderCreateScreen();
    fillField('Nom de la ferme', 'Ferme Aït Amira');
    fillField('Surface totale (ha)', '5');

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith({
        name: 'Ferme Aït Amira',
        totalAreaHa: 5,
        region: undefined,
      }),
    );
  });

  it('stays on the form and shows a retryable error when creation fails', async () => {
    mockedCreate.mockRejectedValueOnce(new Error('boom'));

    renderCreateScreen();
    fillValidForm();

    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));

    await waitFor(() =>
      expect(
        screen.getByText("Impossible d'enregistrer la ferme. Réessayez."),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText('Farms page')).not.toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });

  it('returns to the farm list on Annuler', () => {
    renderCreateScreen();

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(screen.getByText('Farms page')).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });
});
