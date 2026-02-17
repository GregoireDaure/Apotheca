import { createZodDto } from 'nestjs-zod';
import { CreateInventoryItemDtoSchema } from '@medicine-manager/shared';

// Create a class from the Zod schema for NestJS strict typing & validation
export class CreateInventoryDto extends createZodDto(CreateInventoryItemDtoSchema) {}
