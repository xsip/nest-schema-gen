import { z } from 'zod';

export const UserDetailsSchema = z.object({
  /** User's first name */
  firstname: z.string(),
  /** User's last name */
  lastname: z.string(),
  /** Optional physical address of the user */
  address: z.string().optional(),
});

export type UserDetails = z.infer<typeof UserDetailsSchema>;
