import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { BookDemoService } from './book-demo.service';
import { BookDemoRequestDto } from './dto/book-demo-request.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller('book-a-demo')
export class BookDemoController {
  constructor(private readonly bookDemo: BookDemoService) {}

  @Public()
  @Post()
  @HttpCode(HttpStatus.OK)
  async submit(@Body() dto: BookDemoRequestDto) {
    await this.bookDemo.notifySales(dto);
    return { success: true };
  }
}
