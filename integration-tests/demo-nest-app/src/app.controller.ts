import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { UserDto } from './dtos/UserDto';
import { ApiExtraModels } from '@nestjs/swagger';

@ApiExtraModels(UserDto)
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }
}
