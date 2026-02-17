import { createZodDto } from 'nestjs-zod';
import { UpdateInventoryItemDtoSchema } from '@medicine-manager/shared';

export class UpdateInventoryDto extends createZodDto(UpdateInventoryItemDtoSchema) {}
