import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import * as webpush from 'web-push';
import { PushSubscription } from './entities/push-subscription.entity';
import { Notification } from './entities/notification.entity';
import { Inventory } from '../inventory/entities/inventory.entity';

interface SubscribeDto {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  label?: string;
}

@Injectable()
export class NotificationsService implements OnModuleInit {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(PushSubscription)
    private readonly subRepo: Repository<PushSubscription>,
    @InjectRepository(Notification)
    private readonly notifRepo: Repository<Notification>,
    @InjectRepository(Inventory)
    private readonly inventoryRepo: Repository<Inventory>,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const publicKey = this.configService.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.configService.get<string>('VAPID_PRIVATE_KEY');
    const subject = this.configService.get<string>('VAPID_SUBJECT', 'mailto:admin@apotheca.local');

    if (publicKey && privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
      this.logger.log('VAPID keys configured');
    } else {
      this.logger.warn(
        'VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY not set — push notifications disabled. ' +
        'Generate keys with: npx web-push generate-vapid-keys',
      );
    }
  }

  /** Return the VAPID public key so the frontend can subscribe */
  getVapidPublicKey(): string | null {
    return this.configService.get<string>('VAPID_PUBLIC_KEY') ?? null;
  }

  /** Store a push subscription from the browser */
  async subscribe(dto: SubscribeDto): Promise<PushSubscription> {
    // Upsert by endpoint
    const existing = await this.subRepo.findOne({ where: { endpoint: dto.endpoint } });
    if (existing) {
      existing.p256dh = dto.keys.p256dh;
      existing.auth = dto.keys.auth;
      existing.label = dto.label ?? existing.label;
      return this.subRepo.save(existing);
    }

    return this.subRepo.save(
      this.subRepo.create({
        endpoint: dto.endpoint,
        p256dh: dto.keys.p256dh,
        auth: dto.keys.auth,
        label: dto.label ?? null,
      }),
    );
  }

  /** Remove a push subscription */
  async unsubscribe(endpoint: string): Promise<void> {
    await this.subRepo.delete({ endpoint });
  }

  /** Get all notifications, newest first */
  async findAll(): Promise<Notification[]> {
    return this.notifRepo.find({ order: { createdAt: 'DESC' }, take: 50 });
  }

  /** Mark a notification as read */
  async markRead(id: string): Promise<void> {
    await this.notifRepo.update(id, { read: true });
  }

  /** Mark all notifications as read */
  async markAllRead(): Promise<void> {
    await this.notifRepo.update({}, { read: true });
  }

  /** Get unread count */
  async getUnreadCount(): Promise<number> {
    return this.notifRepo.count({ where: { read: false } });
  }

  /**
   * Daily cron: check inventory for expiring/expired/restock items,
   * create notifications, and send push messages.
   * Runs every day at 9:00 AM.
   */
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async checkExpiryAndRestock(): Promise<void> {
    this.logger.log('Running daily expiry & restock check...');

    const items = await this.inventoryRepo.find();
    const now = new Date();
    const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const notifications: Partial<Notification>[] = [];

    for (const item of items) {
      const name = item.medicine?.denomination ?? item.cis;

      if (item.expiryDate) {
        if (item.expiryDate < now) {
          notifications.push({
            type: 'expired',
            title: 'Medicine expired',
            body: `${name} has expired.`,
            inventoryItemId: item.id,
          });
        } else if (item.expiryDate <= sevenDays) {
          notifications.push({
            type: 'expiring',
            title: 'Expiring this week',
            body: `${name} expires in less than 7 days.`,
            inventoryItemId: item.id,
          });
        } else if (item.expiryDate <= thirtyDays) {
          notifications.push({
            type: 'expiring',
            title: 'Expiring soon',
            body: `${name} expires within 30 days.`,
            inventoryItemId: item.id,
          });
        }
      }

      if (item.restockAlert && item.quantity <= 1) {
        notifications.push({
          type: 'restock',
          title: 'Restock needed',
          body: `${name} is running low (${item.quantity} left).`,
          inventoryItemId: item.id,
        });
      }
    }

    if (notifications.length === 0) {
      this.logger.log('No items need attention today');
      return;
    }

    // Save notifications to database
    const saved = await this.notifRepo.save(
      notifications.map((n) => this.notifRepo.create(n)),
    );
    this.logger.log(`Created ${saved.length} notifications`);

    // Send push to all subscriptions
    await this.sendPushToAll({
      title: 'Apotheca',
      body: `${saved.length} item(s) need your attention`,
      data: { url: '/' },
    });
  }

  /**
   * Immediately trigger a restock notification for a single inventory item.
   * Called from InventoryService when quantity drops to threshold.
   */
  async triggerRestockAlert(item: Inventory): Promise<void> {
    const name = item.medicine?.denomination ?? item.cis;

    const notification = this.notifRepo.create({
      type: 'restock',
      title: 'Restock needed',
      body: `${name} is running low (${item.quantity} left).`,
      inventoryItemId: item.id,
    });
    await this.notifRepo.save(notification);

    await this.sendPushToAll({
      title: 'Apotheca – Restock needed',
      body: `${name} is running low (${item.quantity} left).`,
      data: { url: '/' },
    });
  }

  /** Send a push notification to all registered subscriptions */
  private async sendPushToAll(payload: {
    title: string;
    body: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    const publicKey = this.configService.get<string>('VAPID_PUBLIC_KEY');
    if (!publicKey) return;

    const subs = await this.subRepo.find();
    const jsonPayload = JSON.stringify(payload);

    const results = await Promise.allSettled(
      subs.map((sub) =>
        webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          jsonPayload,
        ),
      ),
    );

    // Remove expired/invalid subscriptions (410 Gone)
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status === 'rejected') {
        const statusCode = (result.reason as any)?.statusCode;
        if (statusCode === 410 || statusCode === 404) {
          await this.subRepo.delete(subs[i].id);
          this.logger.log(`Removed stale subscription: ${subs[i].endpoint.slice(0, 50)}...`);
        }
      }
    }
  }
}
