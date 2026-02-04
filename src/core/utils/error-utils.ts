/**
 * @file Shared error utilities.
 */

export interface ErrnoException extends Error {
  errno?: number;
  code?: string;
  path?: string;
  syscall?: string;
}

export function isErrnoException(error: unknown): error is ErrnoException {
  return (
    error instanceof Error && typeof (error as ErrnoException).code === 'string'
  );
}
