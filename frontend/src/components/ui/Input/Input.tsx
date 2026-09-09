import { forwardRef } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import type { InputState, InputVariant } from '../../../types/ui.types';
import styles from './Input.module.css';

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix' | 'size'> {
  /** Variante du champ. `text` par défaut ; `search` ajoute l'icône loupe + bouton clear. */
  variant?: InputVariant;
  /** État visuel, aligné sur l'Input system Figma. */
  state?: InputState;
  /** Label affiché au-dessus du champ. */
  label?: string;
  /** Contenu non éditable affiché avant la valeur (ex. "+212"). Variante `text` uniquement. */
  prefix?: ReactNode;
  /** Si défini, branche `aria-describedby` vers l'élément affichant ce message (ex. ErrorMessage). */
  errorMessage?: string;
  /** Appelée au clic sur le bouton clear (variante `search`). Si absente, le bouton clear est masqué. */
  onClear?: () => void;
}

/**
 * Champ de formulaire du design system Al Katra.
 *
 * Variantes :
 * - `text` : champ classique avec label, préfixe optionnel, états default/filled/error.
 * - `search` : champ de recherche avec icône loupe (lucide/Search) à gauche
 *   et bouton clear (lucide/X) à droite, qui n'apparaît que si une valeur
 *   est saisie et qu'un gestionnaire `onClear` est fourni.
 *
 * Le composant est contrôlé : la valeur et les callbacks (onChange, onClear)
 * sont détenus par le parent.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    variant = 'text',
    state = 'default',
    label,
    prefix,
    errorMessage,
    onClear,
    id,
    value,
    className,
    ...rest
  },
  ref,
) {
  const inputId = id ?? rest.name;
  const describedBy = errorMessage && inputId ? `${inputId}-error` : undefined;
  const hasValue = typeof value === 'string' ? value.length > 0 : Boolean(value);
  const showClear = variant === 'search' && hasValue && onClear;

  return (
    <div className={styles.wrapper}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
      )}

      <div className={[styles.field, styles[state]].join(' ')}>
        {variant === 'search' && <Search className={styles.searchIcon} aria-hidden="true" />}

        {variant === 'text' && prefix && <span className={styles.prefix}>{prefix}</span>}

        <input
          id={inputId}
          ref={ref}
          className={[styles.input, className].filter(Boolean).join(' ')}
          aria-invalid={state === 'error' || undefined}
          aria-describedby={describedBy}
          value={value}
          {...rest}
        />

        {showClear && (
          <button
            type="button"
            className={styles.clearButton}
            onClick={onClear}
            aria-label="Effacer la saisie"
          >
            <X aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
});
