import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { BdpmService } from './bdpm.service';

@ApiTags('BDPM')
@Controller('bdpm')
export class BdpmController {
  constructor(private readonly bdpmService: BdpmService) {}

  @Get('lookup/:code')
  @ApiOperation({ summary: 'Lookup medicine by CIP13 or CIS code' })
  async lookup(@Param('code') code: string) {
    return this.bdpmService.findByCode(code);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search medicines by name' })
  @ApiQuery({ name: 'q', required: true })
  async search(@Query('q') query: string) {
    return this.bdpmService.search(query);
  }
}
