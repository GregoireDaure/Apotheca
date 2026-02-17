import { Entity, PrimaryColumn, Column, OneToMany } from 'typeorm';
import { Inventory } from '../../inventory/entities/inventory.entity';

@Entity('medicines')
export class Medicine {
  @PrimaryColumn({ length: 13 })
  cis: string;

  @Column({ length: 13, nullable: true })
  cip13: string;

  @Column()
  denomination: string;

  @Column({ nullable: true })
  pharmaceuticalForm: string;

  @Column('simple-array', { nullable: true })
  administrationRoutes: string[];

  @Column({ nullable: true })
  type: string;

  @Column({ nullable: true })
  status: string;

  @Column({ nullable: true })
  commercializationStatus: string;

  @Column('jsonb', { nullable: true })
  composition: { substance: string; dosage: string }[];

  @Column({ nullable: true })
  bdpmUrl: string;

  @OneToMany(() => Inventory, (inventory) => inventory.medicine)
  inventoryItems: Inventory[];
}
