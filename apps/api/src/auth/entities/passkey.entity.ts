import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * Represents a WebAuthn passkey credential registered to the single
 * shared household account.
 *
 * The app uses a "single account" model: one inventory, multiple
 * passkey credentials (one per household member's device).
 */
@Entity('passkeys')
export class Passkey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** WebAuthn credential ID (base64url-encoded) */
  @Column({ type: 'text', unique: true })
  credentialId: string;

  /** WebAuthn credential public key (base64url-encoded) */
  @Column({ type: 'text' })
  publicKey: string;

  /** WebAuthn sign counter — incremented on each authentication */
  @Column({ type: 'bigint', default: 0 })
  counter: number;

  /** Credential device type: 'singleDevice' | 'multiDevice' */
  @Column({ type: 'text', default: 'multiDevice' })
  deviceType: string;

  /** Whether the credential is backed up (synced via iCloud Keychain etc) */
  @Column({ type: 'boolean', default: false })
  backedUp: boolean;

  /** Authenticator transports (e.g. ['internal', 'hybrid']) */
  @Column('simple-array', { nullable: true })
  transports: string[] | null;

  /** Display label (e.g. "Greg's iPhone", "Wife's iPhone") */
  @Column({ type: 'text', nullable: true })
  label: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  lastUsedAt: Date;
}
