import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { MemoryNotesService } from './memory-notes.service';
import { CreateMemoryNoteDto } from './dto/create-memory-note.dto';
import { UpdateMemoryNoteDto } from './dto/update-memory-note.dto';

@Controller('memory-notes')
export class MemoryNotesController {
  constructor(private readonly memoryNotesService: MemoryNotesService) {}

  @Post()
  create(@Body() dto: CreateMemoryNoteDto) {
    return this.memoryNotesService.create(dto);
  }

  @Get()
  list(
    @Query('subjectType') subjectType: string,
    @Query('subjectId') subjectId: string,
  ) {
    return this.memoryNotesService.list(subjectType, subjectId);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateMemoryNoteDto) {
    return this.memoryNotesService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.memoryNotesService.remove(id);
  }
}
