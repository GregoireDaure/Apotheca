import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { CreateInventoryDto } from './dto/create-inventory.dto';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { ManualEntryDto } from './dto/manual-entry.dto';
import { BulkAddDto } from './dto/bulk-add.dto';
import { BulkRemoveDto } from './dto/bulk-remove.dto';

@ApiTags('inventory')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Post()
  @ApiOperation({ summary: 'Add medicine to inventory (auto-increments if already exists)' })
  @ApiResponse({ status: 201, description: 'The item has been successfully created or incremented.' })
  create(@Body() createInventoryDto: CreateInventoryDto) {
    return this.inventoryService.create(createInventoryDto);
  }

  @Post('manual')
  @ApiOperation({ summary: 'Add a manually-entered medicine (no BDPM match)' })
  @ApiResponse({ status: 201, description: 'Manual medicine added to inventory.' })
  createManual(@Body() manualEntryDto: ManualEntryDto) {
    return this.inventoryService.createManual(manualEntryDto);
  }

  @Post('bulk-add')
  @ApiOperation({ summary: 'Bulk add medicines to inventory (pharmacy bag unload)' })
  @ApiResponse({ status: 201, description: 'Bulk add results.' })
  bulkAdd(@Body() bulkAddDto: BulkAddDto) {
    return this.inventoryService.bulkAdd(bulkAddDto);
  }

  @Post('bulk-remove')
  @ApiOperation({ summary: 'Bulk remove (decrement) medicines from inventory' })
  @ApiResponse({ status: 200, description: 'Bulk remove results.' })
  bulkRemove(@Body() bulkRemoveDto: BulkRemoveDto) {
    return this.inventoryService.bulkRemove(bulkRemoveDto);
  }

  @Get()
  @ApiOperation({ summary: 'List all inventory items' })
  findAll() {
    return this.inventoryService.findAll();
  }

  @Get('dashboard')
  @ApiOperation({ summary: 'Get dashboard stats (total, expiring, expired, restock)' })
  getDashboardStats() {
    return this.inventoryService.getDashboardStats();
  }

  @Get('actions')
  @ApiOperation({ summary: 'Get items needing attention (expiring, expired, restock)' })
  getActionItems() {
    return this.inventoryService.getActionItems();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get inventory item by ID' })
  findOne(@Param('id') id: string) {
    return this.inventoryService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update inventory item' })
  update(@Param('id') id: string, @Body() updateInventoryDto: UpdateInventoryDto) {
    return this.inventoryService.update(id, updateInventoryDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete inventory item' })
  remove(@Param('id') id: string) {
    return this.inventoryService.remove(id);
  }
}
