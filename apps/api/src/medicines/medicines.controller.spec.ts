import { Test, TestingModule } from '@nestjs/testing';
import { MedicinesController } from './medicines.controller';

describe('MedicinesController', () => {
  let controller: MedicinesController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MedicinesController],
    }).compile();

    controller = module.get<MedicinesController>(MedicinesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
