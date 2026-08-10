import { useMemo, useState } from 'react';

const COUNTRY_CODE = '+212';
const LOCAL_DIGITS_LENGTH = 9;

// Mirrors auth-service's LoginDto / VerifyOtpDto regex exactly.
const MOROCCAN_PHONE_REGEX = /^\+212[67]\d{8}$/;

/** Groups local digits as "6XX XX XX XX", matching the Figma placeholder/examples. */
function formatLocalDigits(digits: string): string {
  const groups = [digits.slice(0, 3), digits.slice(3, 5), digits.slice(5, 7), digits.slice(7, 9)];
  return groups.filter(Boolean).join(' ');
}

export interface UsePhoneNumberResult {
  /** Raw local digits (no country code, no spaces), max 9 characters. */
  digits: string;
  /** Local digits formatted for display, e.g. "617 50 36 77". */
  formattedValue: string;
  /** Full E.164-ish value sent to the backend, e.g. "+212617503677". */
  fullPhone: string;
  isEmpty: boolean;
  isValid: boolean;
  countryCode: string;
  /** Feed raw input (typed or pasted) here; non-digits are stripped automatically. */
  setFromInput: (raw: string) => void;
}

export function usePhoneNumber(): UsePhoneNumberResult {
  const [digits, setDigits] = useState('');

  const setFromInput = (raw: string) => {
    const onlyDigits = raw.replace(/\D/g, '').slice(0, LOCAL_DIGITS_LENGTH);
    setDigits(onlyDigits);
  };

  const formattedValue = useMemo(() => formatLocalDigits(digits), [digits]);
  const fullPhone = `${COUNTRY_CODE}${digits}`;
  const isValid = useMemo(() => MOROCCAN_PHONE_REGEX.test(fullPhone), [fullPhone]);

  return {
    digits,
    formattedValue,
    fullPhone,
    isEmpty: digits.length === 0,
    isValid,
    countryCode: COUNTRY_CODE,
    setFromInput,
  };
}