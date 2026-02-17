import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('push_subscriptions')
export class PushSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The unique push endpoint URL from the browser */
  @Column({ type: 'text', unique: true })
  endpoint: string;

  /** VAPID p256dh key */
  @Column({ type: 'text' })
  p256dh: string;

  /** VAPID auth secret */
  @Column({ type: 'text' })
  auth: string;

  /** Optional label for the device */
  @Column({ type: 'text', nullable: true })
  label: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
