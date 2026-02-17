import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Delete,
} from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { Public } from '../auth/decorators/public.decorator';

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /** Get VAPID public key for the frontend to subscribe */
  @Get('vapid-public-key')
  @Public()
  getVapidPublicKey() {
    return { key: this.notificationsService.getVapidPublicKey() };
  }

  /** Register a push subscription */
  @Post('subscribe')
  async subscribe(
    @Body()
    body: {
      endpoint: string;
      keys: { p256dh: string; auth: string };
      label?: string;
    },
  ) {
    const sub = await this.notificationsService.subscribe(body);
    return { id: sub.id };
  }

  /** Remove a push subscription */
  @Post('unsubscribe')
  async unsubscribe(@Body() body: { endpoint: string }) {
    await this.notificationsService.unsubscribe(body.endpoint);
    return { ok: true };
  }

  /** List recent notifications */
  @Get()
  async findAll() {
    return this.notificationsService.findAll();
  }

  /** Get unread count */
  @Get('unread-count')
  async getUnreadCount() {
    return { count: await this.notificationsService.getUnreadCount() };
  }

  /** Mark a notification as read */
  @Patch(':id/read')
  async markRead(@Param('id') id: string) {
    await this.notificationsService.markRead(id);
    return { ok: true };
  }

  /** Mark all notifications as read */
  @Post('mark-all-read')
  async markAllRead() {
    await this.notificationsService.markAllRead();
    return { ok: true };
  }
}
