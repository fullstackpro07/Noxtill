import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { SegmentsService } from './segments.service';
import { CreateSegmentDto } from './dto/create-segment.dto';
import { UpdateSegmentDto } from './dto/update-segment.dto';
import { SegmentRulesDto } from './dto/segment-rules.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('segments')
export class SegmentsController {
  constructor(private readonly segmentsService: SegmentsService) {}

  @Get()
  list() {
    return this.segmentsService.list();
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateSegmentDto,
  ) {
    return this.segmentsService.create(user.businessId, dto);
  }

  @Post('preview')
  preview(@Body() rules: SegmentRulesDto) {
    return this.segmentsService.previewCount(rules);
  }

  @Post('suggest-persona')
  suggestPersona(
    @CurrentUser() user: AuthenticatedUser,
    @Body() rules: SegmentRulesDto,
  ) {
    return this.segmentsService.suggestPersona(user.businessId, rules);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateSegmentDto) {
    return this.segmentsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.segmentsService.remove(id);
  }

  @Post(':id/duplicate')
  duplicate(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.segmentsService.duplicate(user.businessId, id);
  }

  /** Legacy hardcoded keys AND real Segment ids, transparently — see `SegmentsService.getSegment`. */
  @Get(':key')
  getSegment(@Param('key') key: string) {
    return this.segmentsService.getSegment(key);
  }
}
