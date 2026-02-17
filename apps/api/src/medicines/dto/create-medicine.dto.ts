import { createZodDto } from 'nestjs-zod';
import { MedicineSchema } from '@medicine-manager/shared';

export class CreateMedicineDto extends createZodDto(MedicineSchema) {}
