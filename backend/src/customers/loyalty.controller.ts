import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { LoyaltyService } from './loyalty.service';
import { CreateLoyaltyProgramDto } from './dto/create-loyalty-program.dto';
import { EnrollLoyaltyMemberDto } from './dto/enroll-loyalty-member.dto';

@Controller()
export class LoyaltyController {
  constructor(private readonly loyaltyService: LoyaltyService) {}

  @Post('loyalty-programs')
  create(@Body() dto: CreateLoyaltyProgramDto) {
    return this.loyaltyService.createProgram(dto);
  }

  @Get('loyalty-programs')
  list() {
    return this.loyaltyService.listPrograms();
  }

  @Post('loyalty-programs/:id/enroll')
  enroll(@Param('id') id: string, @Body() dto: EnrollLoyaltyMemberDto) {
    return this.loyaltyService.enroll(id, dto);
  }

  @Get('loyalty-programs/:id/members')
  listMembers(@Param('id') id: string) {
    return this.loyaltyService.listMembers(id);
  }

  @Post('loyalty-members/:id/redeem')
  redeem(@Param('id') id: string) {
    return this.loyaltyService.redeem(id);
  }
}
