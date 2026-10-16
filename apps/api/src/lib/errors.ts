import type { Response } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, message: string, code = 'APP_ERROR', details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function sendError(res: Response, err: unknown) {
  if (err instanceof AppError) {
    return res.status(err.status).json({
      error: { message: err.message, code: err.code, details: err.details },
    });
  }
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: {
        message: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: err.flatten(),
      },
    });
  }
  console.error(err);
  return res.status(500).json({
    error: { message: 'Unexpected server error', code: 'INTERNAL_ERROR' },
  });
}
