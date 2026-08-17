import { isAxiosError } from 'axios';

/**
 * Corps d'erreur émis par le AllExceptionsFilter des services NestJS
 * (voir apps/farm-service/src/common/filters/all-exceptions.filter.ts) :
 * `message` peut être une chaîne OU un tableau (ValidationPipe 422).
 */
interface ServiceErrorBody {
  statusCode: number;
  errorCode: string;
  message: string | string[];
}

/**
 * Extrait un message d'erreur affichable d'une erreur Axios.
 * Retourne `fallback` si l'erreur ne transporte pas de message exploitable
 * (erreur réseau, timeout, JSON inattendu).
 */
export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError<ServiceErrorBody>(error)) {
    const message = error.response?.data?.message;

    if (typeof message === 'string' && message.length > 0) {
      return message;
    }

    if (Array.isArray(message) && message.length > 0) {
      return message.filter((item) => item.length > 0).join(' ');
    }
  }

  return fallback;
}
