import { z } from 'zod';

import { UserDetailsSchema } from './UserDetails';
import { RolesSchema } from './Roles';

export const UserSchema = z.object({
  /** Unique username used for login or identification */
  username: z.string(),
  /** Nested object containing personal details of the user */
  details: UserDetailsSchema,
  /** User's email address for contact and authentication */
  email: z.string(),
  /** User's password (should be stored securely, e.g., hashed) */
  password: z.string(),
  /** Optional list of roles assigned to the user (e.g., USER, ADMIN) */
  roles: z.array(RolesSchema).optional(),
  /** Array of inline role identifiers with limited predefined values */
  inlineRoles: z.array(z.enum(['test1', 'test2', 'test3'])),
});

export type User = z.infer<typeof UserSchema>;
