import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsString } from 'class-validator';
import { LiveListenerService } from './live-listener.service';
import { AdminAuthGuard } from '../common/admin-auth.guard';

class ConnectDto {
  @IsString()
  username: string;
}

@Controller('tiktok')
export class LiveListenerController {
  constructor(private readonly listener: LiveListenerService) {}

  @Get('status')
  status() {
    return this.listener.getStatus();
  }

  @Post('connect')
  @UseGuards(AdminAuthGuard)
  connect(@Body() dto: ConnectDto) {
    return this.listener.connect(dto.username);
  }

  @Post('disconnect')
  @UseGuards(AdminAuthGuard)
  async disconnect() {
    await this.listener.disconnect();
    return { ok: true };
  }
}
