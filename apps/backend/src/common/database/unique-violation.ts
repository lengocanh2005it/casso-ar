import { QueryFailedError } from 'typeorm';

export function isUniqueViolation(error: unknown): boolean {
  if (
    !(error instanceof QueryFailedError) ||
    typeof error.driverError !== 'object' ||
    error.driverError === null
  ) {
    return false;
  }
  return 'code' in error.driverError && error.driverError.code === '23505';
}
