import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CompetitorsService } from './competitors.service';
import { CreateCompetitorDto } from './dto/create-competitor.dto';
import { UpdateCompetitorDto } from './dto/update-competitor.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../common/tenancy/auth-context';

@Controller('competitors')
export class CompetitorsController {
  constructor(private readonly competitorsService: CompetitorsService) {}

  @Get()
  list() {
    return this.competitorsService.list();
  }

  @Post()
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCompetitorDto,
  ) {
    return this.competitorsService.create(user.businessId, dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateCompetitorDto) {
    return this.competitorsService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.competitorsService.remove(id);
  }

  @Get(':id/ads')
  ads(@Param('id') id: string) {
    return this.competitorsService.ads(id);
  }

  @Get(':id/history')
  history(@Param('id') id: string) {
    return this.competitorsService.history(id);
  }

  @Post(':id/snapshot')
  triggerSnapshot(@Param('id') id: string) {
    return this.competitorsService.triggerSnapshot(id);
  }
}
