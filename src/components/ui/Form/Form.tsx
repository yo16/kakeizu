import React from 'react';
import styles from './Form.module.css';

/* ---- FormField ---- */

export interface FormFieldProps {
  children: React.ReactNode;
  className?: string;
}

export function FormField({ children, className }: FormFieldProps) {
  const classNames = [styles.field, className ?? ''].filter(Boolean).join(' ');
  return <div className={classNames}>{children}</div>;
}

/* ---- FormLabel ---- */

export interface FormLabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
  children: React.ReactNode;
}

export function FormLabel({ required, children, ...rest }: FormLabelProps) {
  return (
    <label className={styles.label} {...rest}>
      {children}
      {required && (
        <span className={styles.required} aria-hidden="true">
          *
        </span>
      )}
    </label>
  );
}

/* ---- FormError ---- */

export interface FormErrorProps {
  message?: string;
  id?: string;
}

export function FormError({ message, id }: FormErrorProps) {
  if (message === undefined) return null;
  return (
    <p className={styles.errorMessage} role="alert" id={id}>
      {message}
    </p>
  );
}
