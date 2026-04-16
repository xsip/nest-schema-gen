import { z } from 'zod';

export enum Roles {
  USER = 'user',
  ADMIN = 'admin',
}

export const RolesSchema = z.nativeEnum(Roles);

export type RolesType = z.infer<typeof RolesSchema>;
