import { z } from 'zod';

// Shared ID types
export const CisIdSchema = z.string().regex(/^\d+$/, "Must be a numeric string");
export const Cip13Schema = z.string().length(13).regex(/^\d+$/, "Must be a 13-digit numeric string");

// Composition entry (active substance + dosage)
export const CompositionEntrySchema = z.object({
  substance: z.string(),
  dosage: z.string(),
});

export type CompositionEntry = z.infer<typeof CompositionEntrySchema>;

// Medicine Entity (Static Reference Data from BDPM)
export const MedicineSchema = z.object({
  cis: CisIdSchema,
  cip13: Cip13Schema.optional(),
  denomination: z.string(),
  pharmaceuticalForm: z.string().optional(),
  administrationRoutes: z.array(z.string()).optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  commercializationStatus: z.string().optional(),
  composition: z.array(CompositionEntrySchema).optional(),
  bdpmUrl: z.string().optional(),
});

export type Medicine = z.infer<typeof MedicineSchema>;

// Inventory Entity (User's Stock)
export const InventoryItemSchema = z.object({
  id: z.string().optional(), // Optional for creation
  cis: CisIdSchema,
  batchNumber: z.string().optional(),
  expiryDate: z.string().nullable().optional(), // ISO String
  quantity: z.number().int().min(0).default(1),
  restockAlert: z.boolean().default(false), // Opt-in: alert when last box
  addedAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export type InventoryItem = z.infer<typeof InventoryItemSchema>;

// DTOs for API Operations
export const CreateInventoryItemDtoSchema = InventoryItemSchema.omit({ 
  id: true, 
  addedAt: true, 
  updatedAt: true 
});

export type CreateInventoryItemDto = z.infer<typeof CreateInventoryItemDtoSchema>;

export const UpdateInventoryItemDtoSchema = InventoryItemSchema.partial().omit({ 
  id: true, 
  cis: true, // Cannot change the medicine reference of an item
  addedAt: true, 
  updatedAt: true 
});

export type UpdateInventoryItemDto = z.infer<typeof UpdateInventoryItemDtoSchema>;

// Manual medicine entry — when no BDPM match exists (FR8)
export const ManualMedicineEntrySchema = z.object({
  denomination: z.string().min(1, 'Medicine name is required').max(200),
  pharmaceuticalForm: z.string().optional().default(''),
  expiryDate: z.string().nullable().optional(),
  quantity: z.number().int().min(1).default(1),
  batchNumber: z.string().optional().default(''),
});

export type ManualMedicineEntry = z.infer<typeof ManualMedicineEntrySchema>;

// Bulk scan operations — batch add or remove multiple medicines at once
export const BulkScanItemSchema = z.object({
  cis: CisIdSchema,
  expiryDate: z.string().nullable().optional(),
  batchNumber: z.string().optional().default(''),
  quantity: z.number().int().min(1).default(1),
});

export type BulkScanItem = z.infer<typeof BulkScanItemSchema>;

export const BulkAddDtoSchema = z.object({
  items: z.array(BulkScanItemSchema).min(1).max(50),
});

export type BulkAddDto = z.infer<typeof BulkAddDtoSchema>;

export const BulkRemoveDtoSchema = z.object({
  /** CIS codes identifying inventory items to decrement */
  items: z.array(z.object({
    cis: CisIdSchema,
    quantity: z.number().int().min(1).default(1),
  })).min(1).max(50),
});

export type BulkRemoveDto = z.infer<typeof BulkRemoveDtoSchema>;
