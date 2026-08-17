import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';

function renderDialog(overrides: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) {
  const props = {
    open: true,
    title: 'Supprimer cette ferme ?',
    description: ['Cette action est irréversible.', 'Toutes les données seront perdues.'],
    cancelLabel: 'Annuler',
    confirmLabel: 'Supprimer',
    onCancel: vi.fn(),
    onConfirm: vi.fn(),
    ...overrides,
  };

  render(<ConfirmDialog {...props} />);

  return props;
}

describe('ConfirmDialog', () => {
  it('renders nothing while closed', () => {
    renderDialog({ open: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the title, description lines and both actions while open', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Supprimer cette ferme ?')).toBeInTheDocument();
    expect(screen.getByText('Cette action est irréversible.')).toBeInTheDocument();
    expect(screen.getByText('Toutes les données seront perdues.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Annuler' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeEnabled();
  });

  it('calls onCancel when the cancel button is clicked', () => {
    const props = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));

    expect(props.onCancel).toHaveBeenCalledTimes(1);
    expect(props.onConfirm).not.toHaveBeenCalled();
  });

  it('calls onConfirm when the confirm button is clicked', () => {
    const props = renderDialog();

    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));

    expect(props.onConfirm).toHaveBeenCalledTimes(1);
    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when Escape is pressed', () => {
    const props = renderDialog();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it('locks both actions while busy', () => {
    renderDialog({ busy: true });

    // En chargement, le label du bouton de confirmation est remplacé par un
    // spinner : on cible donc les deux boutons de la modale par position.
    const [cancelButton, confirmButton] = screen.getAllByRole('button');
    expect(cancelButton).toBeDisabled();
    expect(confirmButton).toBeDisabled();
    expect(confirmButton).toHaveAttribute('aria-busy', 'true');
  });

  it('does not close on Escape while busy', () => {
    const props = renderDialog({ busy: true });

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(props.onCancel).not.toHaveBeenCalled();
  });

  it('displays the business error message inside the dialog', async () => {
    renderDialog({ errorMessage: 'Suppression impossible : la ferme possède 2 parcelle(s).' });

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('2 parcelle(s)'),
    );
  });
});
