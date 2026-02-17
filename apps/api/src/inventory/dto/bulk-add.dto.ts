import { createZodDto } from 'nestjs-zod';
import { BulkAddDtoSchema } from '@medicine-manager/shared';

export class BulkAddDto extends createZodDto(BulkAddDtoSchema) {}
