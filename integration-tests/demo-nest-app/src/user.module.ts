import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UserSchema } from './schemas/User';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: 'TestUser', schema: UserSchema }]),
  ],
  controllers: [],
  providers: [],
})
export class UserModule {}
