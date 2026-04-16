import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

@Schema({ timestamps: true })
export class UserDetails {
  @Prop({
    required: true,
    type: String,
  })
  firstname!: string;

  @Prop({
    required: true,
    type: String,
  })
  lastname!: string;

  @Prop({ type: String })
  address?: string;
}

export const UserDetailsSchema = SchemaFactory.createForClass(UserDetails);
