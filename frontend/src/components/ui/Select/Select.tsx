import { forwardRef } from 'react';
import type { SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import type { InputState } from '../../../types/ui.types';
import styles from './Select.module.css';

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> {
  /** Label displayed above the field, same convention as `Input`. */
  label?: string;
  /** Visual state, same union as `Input` (`InputState`) for consistency. */
  state?: InputState;
  /** Options rendered inside the native `<select>`. */
  options: SelectOption[];
  /** Shown as a disabled, hidden placeholder option when no value is selected. */
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  errorMessage?: string;
}

/**
 * Dropdown selector for the design system.
 *
 * Fills in a gap that was already planned but never built: the Phase 1
 * guide's design-system arborescence lists `Select.tsx` alongside
 * `Button`/`Input`/`Card`, but only the others were ever implemented.
 *
 * Modeled directly on `Input`'s conventions (co-located CSS module,
 * controlled `value`/`onChange`, `label`/`state`/`errorMessage` props) so
 * it behaves predictably next to the fields it will sit beside on forms.
 *
 * Deliberately kept non-generic (`value`/options are plain `string`) —
 * a generic `<T extends string>` version would be premature for a
 * component with exactly one caller today (EditProfileScreen's "Langue"
 * field). Revisit only once a second real use case exists (e.g. a Farm
 * screen's `typeCulture`/`typeSol` dropdowns).
 */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  {
    label,
    state = 'default',
    options,
    placeholder,
    value,
    onChange,
    errorMessage,
    id,
    className,
    disabled,
    ...rest
  },
  ref,
) {
  const selectId = id ?? rest.name;
  const describedBy = errorMessage && selectId ? `${selectId}-error` : undefined;

  return (
    <div className={styles.wrapper}>
      {label && (
        <label htmlFor={selectId} className={styles.label}>
          {label}
        </label>
      )}

      <div
        className={[styles.field, styles[state]].join(' ')}
        data-disabled={disabled || undefined}
      >
        <select
          id={selectId}
          ref={ref}
          className={[styles.select, className].filter(Boolean).join(' ')}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-invalid={state === 'error' || undefined}
          aria-describedby={describedBy}
          disabled={disabled}
          {...rest}
        >
          {placeholder && (
            <option value="" disabled hidden>
              {placeholder}
            </option>
          )}

          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        <ChevronDown className={styles.chevron} aria-hidden="true" />
      </div>
    </div>
  );
});