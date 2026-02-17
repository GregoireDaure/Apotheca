import { Test, TestingModule } from '@nestjs/testing';
import { BdpmController } from './bdpm.controller';
import { BdpmService } from './bdpm.service';

const mockBdpmService = {
  findByCode: jest.fn().mockResolvedValue({ cis: '60001234', denomination: 'Doliprane' }),
  search: jest.fn().mockResolvedValue([]),
};

describe('BdpmController', () => {
  let controller: BdpmController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [BdpmController],
      providers: [
        { provide: BdpmService, useValue: mockBdpmService },
      ],
    }).compile();

    controller = module.get<BdpmController>(BdpmController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('lookup() should call findByCode', async () => {
    const result = await controller.lookup('60001234');
    expect(result.cis).toBe('60001234');
    expect(mockBdpmService.findByCode).toHaveBeenCalledWith('60001234');
  });

  it('search() should call service search', async () => {
    const result = await controller.search('doliprane');
    expect(result).toEqual([]);
    expect(mockBdpmService.search).toHaveBeenCalledWith('doliprane');
  });
});
