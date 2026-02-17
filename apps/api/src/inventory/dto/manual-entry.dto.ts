import { createZodDto } from 'nestjs-zod';
import { ManualMedicineEntrySchema } from '@medicine-manager/shared';

export class ManualEntryDto extends createZodDto(ManualMedicineEntrySchema) {}
