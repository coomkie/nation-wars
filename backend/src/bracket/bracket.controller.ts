import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsString, ArrayMinSize } from 'class-validator';
import { BracketService } from './bracket.service';
import { AdminAuthGuard } from '../common/admin-auth.guard';

class CreateBracketDto {
  @IsArray()
  @ArrayMinSize(2)
  @IsString({ each: true })
  nationIds: string[];
}

@Controller('brackets')
export class BracketController {
  constructor(private readonly bracketService: BracketService) {}

  @Get('active')
  getActive() {
    return this.bracketService.getActive();
  }

  @Get('latest')
  getLatest() {
    return this.bracketService.getLatest();
  }

  @Post('archive')
  @UseGuards(AdminAuthGuard)
  async archive() {
    await this.bracketService.archiveActive();
    return { ok: true };
  }

  @Post()
  @UseGuards(AdminAuthGuard)
  create(@Body() dto: CreateBracketDto) {
    return this.bracketService.create(dto.nationIds);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.bracketService.getById(id);
  }
}
