import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose from 'mongoose';

import { UserDetails } from './UserDetails';
import { Roles } from './Roles';

@Schema({ timestamps: true })
export class User {
  /** Unique username used for login or identification */
  @Prop({
    required: true,
    type: String,
  })
  username!: string;

  /** Nested object containing personal details of the user */
  @Prop({
    required: true,
    type: UserDetails,
  })
  details!: UserDetails;

  /** User's email address for contact and authentication */
  @Prop({
    required: true,
    type: String,
  })
  email!: string;

  /** User's password (should be stored securely, e.g., hashed) */
  @Prop({
    required: true,
    type: String,
  })
  password!: string;

  /** Optional list of roles assigned to the user (e.g., USER, ADMIN) */
  @Prop({
    type: String,
    enum: Roles,
  })
  roles?: Roles[];

  /** Array of inline role identifiers with limited predefined values */
  @Prop({
    required: true,
    type: mongoose.Schema.Types.Mixed,
  })
  inlineRoles!: ('test1' | 'test2' | 'test3')[];
}

export const UserSchema = SchemaFactory.createForClass(User);
