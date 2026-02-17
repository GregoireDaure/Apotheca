import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { BdpmService } from './bdpm.service';
import { BdpmController } from './bdpm.controller';
import { MedicinesModule } from '../medicines/medicines.module';
import * as https from 'https';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10_000,
      httpsAgent: new https.Agent({
        rejectUnauthorized: process.env.NODE_ENV === 'production',
      }),
    }),
    ConfigModule,
    MedicinesModule,
  ],
  providers: [BdpmService],
  controllers: [BdpmController],
  exports: [BdpmService],
})
export class BdpmModule {}
