export enum Roles {
  USER = 'user',
  ADMIN = 'admin',
}

export interface UserDetails {
  firstname: string;
  lastname: string;
  address?: string;
}

export interface IUser {
  username: string;
  details: UserDetails;
  email: string;
  password: string;
  roles?: Array<Roles>;
  inlineRoles: ('test1' | 'test2' | 'test3')[];
}
