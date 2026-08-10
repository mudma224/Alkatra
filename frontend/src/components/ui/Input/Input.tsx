import { forwardRef } from 'react';
import type { InputHTMLAttributes, ReactNode } from 'react';
import styles from './Input.module.css';

export type InputState = 'default' | 'filled' | 'error';

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'prefix'> {
  label?: string;
  state?: InputState;
  /** Static, non-editable content shown before the editable value (e.g. "+212"). */
  prefix?: ReactNode;
  /** When set, wires aria-describedby to the element rendering this message (e.g. ErrorMessage). */
  errorMessage?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, state = 'default', prefix, errorMessage, id, className, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  const describedBy = errorMessage && inputId ? `${inputId}-error` : undefined;

  return (
    <div className={styles.wrapper}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
      )}
      <div className={[styles.field, styles[state]].join(' ')}>
        {prefix && <span className={styles.prefix}>{prefix}</span>}
        <input
          id={inputId}
          ref={ref}
          className={[styles.input, className].filter(Boolean).join(' ')}
          aria-invalid={state === 'error' || undefined}
          aria-describedby={describedBy}
          {...rest}
        />
      </div>
    </div>
  );
});