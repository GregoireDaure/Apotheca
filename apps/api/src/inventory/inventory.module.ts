import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { Inventory } from './entities/inventory.entity';
import { Medicine } from '../medicines/entities/medicine.entity';
import { BdpmModule } from '../bdpm/bdpm.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [TypeOrmModule.forFeature([Inventory, Medicine]), BdpmModule, NotificationsModule],
  controllers: [InventoryController],
  providers: [InventoryService],
  exports: [TypeOrmModule]
})
export class InventoryModule {}
