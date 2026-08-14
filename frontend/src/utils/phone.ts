export const COUNTRY_CODE = '+212';
export const LOCAL_DIGITS_LENGTH = 9;

export const MOROCCAN_PHONE_REGEX = /^\+212[67]\d{8}$/;

export function normalizePhoneDigits(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, LOCAL_DIGITS_LENGTH);
}

export function formatLocalDigits(digits: string): string {
  const groups = [
    digits.slice(0, 3),
    digits.slice(3, 5),
    digits.slice(5, 7),
    digits.slice(7, 9),
  ];

  return groups.filter(Boolean).join(' ');
}

export function toMoroccanE164(rawDigits: string): string {
  return `${COUNTRY_CODE}${normalizePhoneDigits(rawDigits)}`;
}

export function isValidMoroccanPhone(value: string): boolean {
  return MOROCCAN_PHONE_REGEX.test(value);
}

export function displayPhoneLabel(value: string): string {
  const digits = normalizePhoneDigits(value);
  return digits ? formatLocalDigits(digits) : '';
}