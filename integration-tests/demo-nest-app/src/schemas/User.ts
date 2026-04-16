import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import mongoose, { Mongoose } from 'mongoose';

import { Roles } from './Roles';

@Schema({ timestamps: true })
export class User {
  @Prop({
    required: true,
    type: String,
  })
  username!: string;

  @Prop({
    required: true,
    type: String,
  })
  email!: string;

  @Prop({
    required: true,
    type: String,
  })
  password!: string;

  @Prop({
    type: String,
    enum: Roles,
  })
  roles?: Roles[];

  @Prop({
    required: true,
    type: mongoose.Schema.Types.Mixed,
  })
  inlineRoles!: ('test1' | 'test2' | 'test3')[];
}

export const UserSchema = SchemaFactory.createForClass(User);
