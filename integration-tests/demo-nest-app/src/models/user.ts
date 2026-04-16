export enum Roles {
  USER = 'user',
  ADMIN = 'admin',
}

export interface IUser {
  username: string;
  email: string;
  password: string;
  roles?: Array<Roles>;
  inlineRoles: ('test1' | 'test2' | 'test3')[];
}
