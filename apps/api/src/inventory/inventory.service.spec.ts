import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { Inventory } from './entities/inventory.entity';
import { Medicine } from '../medicines/entities/medicine.entity';
import { BdpmService } from '../bdpm/bdpm.service';

// ── Helpers ──────────────────────────────────────────────────────────

function makeMedicine(overrides: Partial<Medicine> = {}): Medicine {
  return {
    cis: '60001234',
    cip13: '3400930000001',
    denomination: 'Doliprane 1000mg',
    pharmaceuticalForm: 'comprimé',
    administrationRoutes: ['orale'],
    type: null,
    status: 'Autorisée',
    commercializationStatus: 'Commercialisée',
    composition: [{ substance: 'Paracétamol', dosage: '1000 mg' }],
    bdpmUrl: 'https://base-donnees-publique.medicaments.gouv.fr/extrait.php?specid=60001234',
    inventoryItems: [],
    ...overrides,
  } as Medicine;
}

function makeInventoryItem(overrides: Partial<Inventory> = {}): Inventory {
  const medicine = makeMedicine();
  return {
    id: 'inv-uuid-1',
    cis: medicine.cis,
    quantity: 2,
    batchNumber: 'LOT-A',
    expiryDate: new Date('2027-06-01'),
    restockAlert: false,
    addedAt: new Date('2026-01-15'),
    updatedAt: new Date('2026-01-15'),
    medicine,
    ...overrides,
  } as Inventory;
}

// ── Mock Repositories ────────────────────────────────────────────────

const mockInventoryRepo = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn((dto) => ({ ...dto })),
  save: jest.fn((entity) => Promise.resolve({ id: 'new-uuid', ...entity })),
  merge: jest.fn((entity, dto) => ({ ...entity, ...dto })),
  delete: jest.fn(),
  remove: jest.fn(),
});

const mockMedicineRepo = () => ({
  create: jest.fn((dto) => ({ ...dto })),
  save: jest.fn((entity) => Promise.resolve(entity)),
});

const mockBdpmService = () => ({
  findByCode: jest.fn(),
  findByCis: jest.fn(),
  findByCip13: jest.fn(),
});

// ── Tests ────────────────────────────────────────────────────────────

describe('InventoryService', () => {
  let service: InventoryService;
  let inventoryRepo: ReturnType<typeof mockInventoryRepo>;
  let medicineRepo: ReturnType<typeof mockMedicineRepo>;
  let bdpmService: ReturnType<typeof mockBdpmService>;

  beforeEach(async () => {
    inventoryRepo = mockInventoryRepo();
    medicineRepo = mockMedicineRepo();
    bdpmService = mockBdpmService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: getRepositoryToken(Inventory), useValue: inventoryRepo },
        { provide: getRepositoryToken(Medicine), useValue: medicineRepo },
        { provide: BdpmService, useValue: bdpmService },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
  });

  // ── create() ─────────────────────────────────────────────────────

  describe('create()', () => {
    it('should add a new medicine to inventory', async () => {
      const medicine = makeMedicine();
      bdpmService.findByCode.mockResolvedValue(medicine);
      inventoryRepo.findOne.mockResolvedValue(null); // not in inventory yet

      const result = await service.create({
        cis: '60001234',
        expiryDate: '2027-06-01',
        batchNumber: 'LOT-A',
        quantity: 1,
      });

      expect(result.incremented).toBe(false);
      expect(inventoryRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ cis: '60001234', quantity: 1 }),
      );
      expect(inventoryRepo.save).toHaveBeenCalled();
    });

    it('should increment quantity when medicine already exists (FR11)', async () => {
      const medicine = makeMedicine();
      const existing = makeInventoryItem({ quantity: 2 });

      bdpmService.findByCode.mockResolvedValue(medicine);
      inventoryRepo.findOne.mockResolvedValue(existing);

      const result = await service.create({
        cis: '60001234',
        quantity: 1,
      });

      expect(result.incremented).toBe(true);
      expect(existing.quantity).toBe(3);
      expect(inventoryRepo.save).toHaveBeenCalledWith(existing);
    });

    it('should throw if CIS is not provided', async () => {
      await expect(service.create({ cis: '' })).rejects.toThrow();
    });
  });

  // ── createManual() ───────────────────────────────────────────────

  describe('createManual()', () => {
    it('should create a manual entry with synthetic CIS (FR8)', async () => {
      const result = await service.createManual({
        denomination: 'Voltarène Emulgel 1%',
        pharmaceuticalForm: 'gel',
        expiryDate: '2027-12-01',
        quantity: 1,
      });

      expect(result.incremented).toBe(false);
      expect(medicineRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          denomination: 'Voltarène Emulgel 1%',
          status: 'manual',
        }),
      );
      expect(medicineRepo.save).toHaveBeenCalled();
      expect(inventoryRepo.save).toHaveBeenCalled();
    });
  });

  // ── findAll() ────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('should return all inventory items sorted by addedAt DESC', async () => {
      const items = [makeInventoryItem(), makeInventoryItem({ id: 'inv-uuid-2' })];
      inventoryRepo.find.mockResolvedValue(items);

      const result = await service.findAll();

      expect(result).toHaveLength(2);
      expect(inventoryRepo.find).toHaveBeenCalledWith({ order: { addedAt: 'DESC' } });
    });
  });

  // ── findOne() ────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('should return the item if found', async () => {
      const item = makeInventoryItem();
      inventoryRepo.findOne.mockResolvedValue(item);

      const result = await service.findOne('inv-uuid-1');
      expect(result.id).toBe('inv-uuid-1');
    });

    it('should throw NotFoundException if not found', async () => {
      inventoryRepo.findOne.mockResolvedValue(null);
      await expect(service.findOne('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ── remove() ─────────────────────────────────────────────────────

  describe('remove()', () => {
    it('should delete the item', async () => {
      inventoryRepo.delete.mockResolvedValue({ affected: 1 });
      await expect(service.remove('inv-uuid-1')).resolves.toBeUndefined();
    });

    it('should throw NotFoundException if nothing was deleted', async () => {
      inventoryRepo.delete.mockResolvedValue({ affected: 0 });
      await expect(service.remove('nonexistent')).rejects.toThrow(NotFoundException);
    });
  });

  // ── getDashboardStats() ──────────────────────────────────────────

  describe('getDashboardStats()', () => {
    it('should return correct counts', async () => {
      const now = new Date();
      const items = [
        makeInventoryItem({ expiryDate: new Date(now.getTime() - 86_400_000) }), // expired
        makeInventoryItem({ expiryDate: new Date(now.getTime() + 10 * 86_400_000) }), // expiring soon (10d)
        makeInventoryItem({ expiryDate: new Date(now.getTime() + 90 * 86_400_000) }), // fine
        makeInventoryItem({ expiryDate: null, restockAlert: true, quantity: 1 }), // restock
      ];
      inventoryRepo.find.mockResolvedValue(items);

      const stats = await service.getDashboardStats();

      expect(stats.total).toBe(4);
      expect(stats.expired).toBe(1);
      expect(stats.expiringSoon).toBe(1);
      expect(stats.restockNeeded).toBe(1);
    });

    it('should return zeros for empty inventory', async () => {
      inventoryRepo.find.mockResolvedValue([]);

      const stats = await service.getDashboardStats();

      expect(stats).toEqual({ total: 0, expiringSoon: 0, expired: 0, restockNeeded: 0 });
    });
  });

  // ── getActionItems() ─────────────────────────────────────────────

  describe('getActionItems()', () => {
    it('should categorize items correctly', async () => {
      const now = new Date();
      const expiredItem = makeInventoryItem({
        id: 'expired',
        expiryDate: new Date(now.getTime() - 86_400_000),
      });
      const expiringItem = makeInventoryItem({
        id: 'expiring',
        expiryDate: new Date(now.getTime() + 15 * 86_400_000),
      });
      const restockItem = makeInventoryItem({
        id: 'restock',
        restockAlert: true,
        quantity: 1,
        expiryDate: new Date(now.getTime() + 365 * 86_400_000),
      });
      inventoryRepo.find.mockResolvedValue([expiredItem, expiringItem, restockItem]);

      const actions = await service.getActionItems();

      expect(actions.expired).toHaveLength(1);
      expect(actions.expiring).toHaveLength(1);
      expect(actions.restock).toHaveLength(1);
    });
  });

  // ── bulkAdd() ────────────────────────────────────────────────────

  describe('bulkAdd()', () => {
    it('should process each item and report results', async () => {
      const medicine = makeMedicine();
      bdpmService.findByCode.mockResolvedValue(medicine);
      inventoryRepo.findOne.mockResolvedValue(null);

      const result = await service.bulkAdd({
        items: [
          { cis: '60001234', quantity: 1 },
          { cis: '60001234', quantity: 2 },
        ],
      });

      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(true);
    });

    it('should report per-item failures without stopping', async () => {
      bdpmService.findByCode
        .mockResolvedValueOnce(makeMedicine())
        .mockRejectedValueOnce(new Error('Not found'));
      inventoryRepo.findOne.mockResolvedValue(null);

      const result = await service.bulkAdd({
        items: [
          { cis: '60001234', quantity: 1 },
          { cis: '99999999', quantity: 1 },
        ],
      });

      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
      expect(result.results[1].error).toContain('Not found');
    });
  });

  // ── bulkRemove() ─────────────────────────────────────────────────

  describe('bulkRemove()', () => {
    it('should decrement quantity', async () => {
      const item = makeInventoryItem({ quantity: 3 });
      inventoryRepo.findOne.mockResolvedValue(item);

      const result = await service.bulkRemove({
        items: [{ cis: '60001234', quantity: 1 }],
      });

      expect(result.results[0].success).toBe(true);
      expect(result.results[0].quantity).toBe(2);
    });

    it('should remove item when quantity reaches zero', async () => {
      const item = makeInventoryItem({ quantity: 1 });
      inventoryRepo.findOne.mockResolvedValue(item);

      const result = await service.bulkRemove({
        items: [{ cis: '60001234', quantity: 1 }],
      });

      expect(result.results[0].success).toBe(true);
      expect(result.results[0].removed).toBe(true);
      expect(inventoryRepo.remove).toHaveBeenCalledWith(item);
    });

    it('should report error for missing items', async () => {
      inventoryRepo.findOne.mockResolvedValue(null);

      const result = await service.bulkRemove({
        items: [{ cis: 'nonexistent', quantity: 1 }],
      });

      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain('Not found');
    });
  });
});
