import { z } from 'zod';
import { Response } from 'express';

export function validateBody<T>(schema: z.ZodSchema<T>, body: unknown, res: Response): T | null {
  const result = schema.safeParse(body);
  if (!result.success) {
    res.status(400).json({ error: result.error.issues[0].message });
    return null;
  }
  return result.data;
}
