import { Test, TestingModule } from '@nestjs/testing';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';

const mockInventoryService = {
  create: jest.fn(),
  createManual: jest.fn(),
  bulkAdd: jest.fn(),
  bulkRemove: jest.fn(),
  findAll: jest.fn().mockResolvedValue([]),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  getDashboardStats: jest.fn().mockResolvedValue({ total: 0, expiringSoon: 0, expired: 0, restockNeeded: 0 }),
  getActionItems: jest.fn().mockResolvedValue({ expiring: [], expired: [], restock: [] }),
};

describe('InventoryController', () => {
  let controller: InventoryController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [InventoryController],
      providers: [
        { provide: InventoryService, useValue: mockInventoryService },
      ],
    }).compile();

    controller = module.get<InventoryController>(InventoryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('findAll() should return inventory items', async () => {
    const result = await controller.findAll();
    expect(result).toEqual([]);
    expect(mockInventoryService.findAll).toHaveBeenCalled();
  });

  it('getDashboardStats() should return stats', async () => {
    const result = await controller.getDashboardStats();
    expect(result.total).toBe(0);
  });

  it('getActionItems() should return action categories', async () => {
    const result = await controller.getActionItems();
    expect(result).toHaveProperty('expiring');
    expect(result).toHaveProperty('expired');
    expect(result).toHaveProperty('restock');
  });
});
