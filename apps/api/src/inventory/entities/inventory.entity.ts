import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Medicine } from '../../medicines/entities/medicine.entity';

@Entity('inventory')
export class Inventory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Medicine, (medicine) => medicine.inventoryItems, { eager: true, cascade: ['insert'] })
  @JoinColumn({ name: 'cis' })
  medicine: Medicine;

  @Column({ length: 13 })
  cis: string;

  @Column({ default: 0 })
  quantity: number;

  @Column({ type: 'text', nullable: true })
  batchNumber: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiryDate: Date | null;

  @Column({ type: 'boolean', default: false })
  restockAlert: boolean;

  @CreateDateColumn()
  addedAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
