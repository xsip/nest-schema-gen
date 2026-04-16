export enum Roles {
  /** Standard user with basic access permissions */
  USER = 'user',

  /** Administrator with elevated privileges */
  ADMIN = 'admin',
}

export interface UserDetails {
  /** User's first name */
  firstname: string;

  /** User's last name */
  lastname: string;

  /** Optional physical address of the user */
  address?: string;
}

export interface IUser {
  /** Unique username used for login or identification */
  username: string;

  /** Nested object containing personal details of the user */
  details: UserDetails;

  /** User's email address for contact and authentication */
  email: string;

  /** User's password (should be stored securely, e.g., hashed) */
  password: string;

  /** Optional list of roles assigned to the user (e.g., USER, ADMIN) */
  roles?: Array<Roles>;

  /** Array of inline role identifiers with limited predefined values */
  inlineRoles: ('test1' | 'test2' | 'test3')[];
}
