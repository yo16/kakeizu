import React, { useId } from 'react';
import styles from './Input.module.css';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftAddon?: React.ReactNode;
  rightAddon?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, leftAddon, rightAddon, className, id: idProp, ...rest },
  ref
) {
  const generatedId = useId();
  const id = idProp ?? generatedId;
  const errorId = `${id}-error`;
  const hasError = Boolean(error);

  const inputRowClass = [
    styles.inputRow,
    hasError ? styles.inputRowError : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={styles.wrapper}>
      {label && (
        <label htmlFor={id} className={styles.label}>
          {label}
        </label>
      )}
      <div className={inputRowClass}>
        {leftAddon && (
          <span className={`${styles.addon} ${styles.addonLeft}`} aria-hidden="true">
            {leftAddon}
          </span>
        )}
        <input
          ref={ref}
          id={id}
          className={[styles.input, className ?? ''].filter(Boolean).join(' ')}
          aria-invalid={hasError ? true : undefined}
          aria-describedby={hasError ? errorId : undefined}
          {...rest}
        />
        {rightAddon && (
          <span className={`${styles.addon} ${styles.addonRight}`} aria-hidden="true">
            {rightAddon}
          </span>
        )}
      </div>
      {hasError && (
        <p id={errorId} className={styles.error} role="alert">
          {error}
        </p>
      )}
      {!hasError && hint && (
        <p className={styles.hint}>{hint}</p>
      )}
    </div>
  );
});
