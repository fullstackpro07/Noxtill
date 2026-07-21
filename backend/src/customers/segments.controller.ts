import { Controller, Get, Param } from '@nestjs/common';
import { SegmentsService } from './segments.service';

@Controller('segments')
export class SegmentsController {
  constructor(private readonly segmentsService: SegmentsService) {}

  @Get(':key')
  getSegment(@Param('key') key: string) {
    return this.segmentsService.getSegment(key);
  }
}
