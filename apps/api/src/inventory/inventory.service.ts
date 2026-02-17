import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Inventory } from './entities/inventory.entity';
import { Medicine } from '../medicines/entities/medicine.entity';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { ManualEntryDto } from './dto/manual-entry.dto';
import { BulkAddDto } from './dto/bulk-add.dto';
import { BulkRemoveDto } from './dto/bulk-remove.dto';
import { BdpmService } from '../bdpm/bdpm.service';
import { NotificationsService } from '../notifications/notifications.service';
import { randomUUID } from 'crypto';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(Inventory)
    private readonly inventoryRepository: Repository<Inventory>,
    @InjectRepository(Medicine)
    private readonly medicineRepository: Repository<Medicine>,
    private readonly bdpmService: BdpmService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Add a medicine to inventory. If the medicine already exists (same CIS),
   * increment quantity instead of creating a duplicate (FR11).
   */
  async create(createInventoryDto: CreateInventoryDto): Promise<{ item: Inventory; incremented: boolean }> {
    if (!createInventoryDto.cis) {
      throw new Error('CIS is required');
    }

    const medicine = await this.bdpmService.findByCode(createInventoryDto.cis);

    // Check if this medicine already exists in inventory
    const existing = await this.inventoryRepository.findOne({
      where: { cis: medicine.cis },
    });

    if (existing) {
      existing.quantity += createInventoryDto.quantity ?? 1;
      // Update expiry if new one is provided and existing one is null
      if (createInventoryDto.expiryDate && !existing.expiryDate) {
        existing.expiryDate = new Date(createInventoryDto.expiryDate);
      }
      const saved = await this.inventoryRepository.save(existing);
      return { item: saved, incremented: true };
    }

    const item = this.inventoryRepository.create({
      cis: medicine.cis,
      quantity: createInventoryDto.quantity ?? 1,
      batchNumber: createInventoryDto.batchNumber ?? null,
      expiryDate: createInventoryDto.expiryDate
        ? new Date(createInventoryDto.expiryDate)
        : null,
      restockAlert: createInventoryDto.restockAlert ?? false,
      medicine,
    });
    const saved = await this.inventoryRepository.save(item);
    return { item: saved, incremented: false };
  }

  /**
   * Create a manually-entered medicine when no BDPM match exists (FR8).
   * Generates a synthetic CIS code prefixed with 'M' to avoid collisions.
   */
  async createManual(dto: ManualEntryDto): Promise<{ item: Inventory; incremented: false }> {
    const syntheticCis = `M${randomUUID().replace(/-/g, '').slice(0, 12)}`;

    const medicine = this.medicineRepository.create({
      cis: syntheticCis,
      denomination: dto.denomination,
      pharmaceuticalForm: dto.pharmaceuticalForm ?? '',
      status: 'manual',
    });
    await this.medicineRepository.save(medicine);

    const item = this.inventoryRepository.create({
      cis: syntheticCis,
      quantity: dto.quantity ?? 1,
      batchNumber: dto.batchNumber ?? null,
      expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : null,
      restockAlert: false,
      medicine,
    });
    const saved = await this.inventoryRepository.save(item);
    return { item: saved, incremented: false };
  }

  async findAll(): Promise<Inventory[]> {
    return await this.inventoryRepository.find({
      order: { addedAt: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Inventory> {
    const item = await this.inventoryRepository.findOne({ where: { id } });
    if (!item) {
      throw new NotFoundException(`Inventory item with ID ${id} not found`);
    }
    return item;
  }

  async update(id: string, updateInventoryDto: UpdateInventoryDto): Promise<Inventory> {
    const item = await this.findOne(id);
    let resolvedExpiry: Date | null | undefined = undefined;
    if (updateInventoryDto.expiryDate) {
      resolvedExpiry = new Date(updateInventoryDto.expiryDate);
    } else if (updateInventoryDto.expiryDate === null) {
      resolvedExpiry = null;
    }

    const updated = this.inventoryRepository.merge(item, {
      ...updateInventoryDto,
      expiryDate: resolvedExpiry,
    });
    const saved = await this.inventoryRepository.save(updated);

    // Trigger restock notification if quantity dropped to threshold
    if (saved.restockAlert && saved.quantity <= 1) {
      await this.notificationsService.triggerRestockAlert(saved);
    }

    return saved;
  }

  async remove(id: string): Promise<void> {
    const result = await this.inventoryRepository.delete(id);
    if (result.affected === 0) {
      throw new NotFoundException(`Inventory item with ID ${id} not found`);
    }
  }

  /**
   * Get dashboard stats: total medicines, expiring soon (30 days), expired, restock needed.
   */
  async getDashboardStats(): Promise<{
    total: number;
    expiringSoon: number;
    expired: number;
    restockNeeded: number;
  }> {
    const all = await this.inventoryRepository.find();
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    let expiringSoon = 0;
    let expired = 0;
    let restockNeeded = 0;

    for (const item of all) {
      if (item.expiryDate) {
        if (item.expiryDate < now) {
          expired++;
        } else if (item.expiryDate <= thirtyDaysFromNow) {
          expiringSoon++;
        }
      }
      if (item.restockAlert && item.quantity <= 1) {
        restockNeeded++;
      }
    }

    return {
      total: all.length,
      expiringSoon,
      expired,
      restockNeeded,
    };
  }

  /**
   * Get items that need attention (expiring, expired, or restock needed).
   */
  async getActionItems(): Promise<{
    expiring: Inventory[];
    expired: Inventory[];
    restock: Inventory[];
  }> {
    const all = await this.inventoryRepository.find();
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const expiring: Inventory[] = [];
    const expired: Inventory[] = [];
    const restock: Inventory[] = [];

    for (const item of all) {
      if (item.expiryDate) {
        if (item.expiryDate < now) {
          expired.push(item);
        } else if (item.expiryDate <= thirtyDaysFromNow) {
          expiring.push(item);
        }
      }
      if (item.restockAlert && item.quantity <= 1) {
        restock.push(item);
      }
    }

    return { expiring, expired, restock };
  }

  /**
   * Bulk add medicines to inventory.
   * Each item is processed independently — partial failures are reported per item.
   */
  async bulkAdd(dto: BulkAddDto): Promise<{
    results: Array<{ cis: string; success: boolean; incremented?: boolean; itemId?: string; quantity?: number; error?: string }>;
  }> {
    type BulkAddResult = { cis: string; success: boolean; incremented?: boolean; itemId?: string; quantity?: number; error?: string };
    const results: BulkAddResult[] = [];
    const items = dto.items ?? [];

    for (const entry of items) {
      const cis = entry.cis ?? '';
      try {
        const result = await this.create({
          cis,
          expiryDate: entry.expiryDate ?? undefined,
          batchNumber: entry.batchNumber ?? '',
          quantity: entry.quantity ?? 1,
        });
        results.push({
          cis,
          success: true,
          incremented: result.incremented,
          itemId: result.item.id,
          quantity: result.item.quantity,
        });
      } catch (error) {
        results.push({
          cis,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { results };
  }

  /**
   * Bulk remove (decrement) medicines from inventory.
   * Decrements quantity for each CIS. If quantity reaches 0, removes the item.
   */
  async bulkRemove(dto: BulkRemoveDto): Promise<{
    results: Array<{ cis: string; success: boolean; removed?: boolean; quantity?: number; error?: string }>;
  }> {
    type BulkRemoveResult = { cis: string; success: boolean; removed?: boolean; quantity?: number; error?: string };
    const results: BulkRemoveResult[] = [];
    const items = dto.items ?? [];

    for (const entry of items) {
      const cis = entry.cis ?? '';
      try {
        const item = await this.inventoryRepository.findOne({ where: { cis } });
        if (!item) {
          results.push({ cis, success: false, error: 'Not found in inventory' });
          continue;
        }

        item.quantity -= entry.quantity ?? 1;

        if (item.quantity <= 0) {
          await this.inventoryRepository.remove(item);
          results.push({ cis, success: true, removed: true, quantity: 0 });
        } else {
          await this.inventoryRepository.save(item);
          if (item.restockAlert && item.quantity <= 1) {
            await this.notificationsService.triggerRestockAlert(item);
          }
          results.push({ cis, success: true, removed: false, quantity: item.quantity });
        }
      } catch (error) {
        results.push({
          cis,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return { results };
  }
}
