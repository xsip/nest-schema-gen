import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true })
export class UserDetails {
  /** User's first name */
  @Prop({
    required: true,
    type: String,
  })
  firstname!: string;

  /** User's last name */
  @Prop({
    required: true,
    type: String,
  })
  lastname!: string;

  /** Optional physical address of the user */
  @Prop({ type: String })
  address?: string;
}

export const UserDetailsSchema = SchemaFactory.createForClass(UserDetails);
