import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { CompetitorsService } from './competitors.service';
import { CreateCompetitorDto } from './dto/create-competitor.dto';
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

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.competitorsService.remove(id);
  }
}
