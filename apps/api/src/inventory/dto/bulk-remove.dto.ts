import { createZodDto } from 'nestjs-zod';
import { BulkRemoveDtoSchema } from '@medicine-manager/shared';

export class BulkRemoveDto extends createZodDto(BulkRemoveDtoSchema) {}
