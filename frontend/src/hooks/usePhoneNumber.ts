import { useMemo, useState } from 'react';
import {
  COUNTRY_CODE,
  formatLocalDigits,
  isValidMoroccanPhone,
  normalizePhoneDigits,
  toMoroccanE164,
} from '../utils/phone';

export interface UsePhoneNumberResult {
  digits: string;
  formattedValue: string;
  fullPhone: string;
  isEmpty: boolean;
  isValid: boolean;
  countryCode: string;
  setFromInput: (raw: string) => void;
}

export function usePhoneNumber(): UsePhoneNumberResult {
  const [digits, setDigits] = useState('');

  const setFromInput = (raw: string) => {
    setDigits(normalizePhoneDigits(raw));
  };

  const formattedValue = useMemo(() => formatLocalDigits(digits), [digits]);
  const fullPhone = useMemo(() => toMoroccanE164(digits), [digits]);
  const isValid = useMemo(() => isValidMoroccanPhone(fullPhone), [fullPhone]);

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