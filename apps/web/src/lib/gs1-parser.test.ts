import { describe, it, expect } from 'vitest'
import {
  parseGs1DataMatrix,
  parseScanResult,
  isCip13,
} from './gs1-parser'

describe('GS1 Parser', () => {
  // ── parseGs1DataMatrix() ───────────────────────────────────────────

  describe('parseGs1DataMatrix()', () => {
    it('should parse a complete DataMatrix string', () => {
      // AI 01 (GTIN-14) + AI 17 (expiry YYMMDD=230630) + AI 10 (batch)
      const raw = '01034009340123081723063010ABC123'
      const result = parseGs1DataMatrix(raw)

      expect(result.isGs1).toBe(true)
      expect(result.gtin).toBe('03400934012308')
      expect(result.cip13).toBe('3400934012308')
      expect(result.expiryDate).toBe('2023-06-30')
      expect(result.batchNumber).toBe('ABC123')
    })

    it('should handle FNC1 prefix ]d2', () => {
      const raw = ']d201034009340123081723063110LOT1'
      const result = parseGs1DataMatrix(raw)

      expect(result.isGs1).toBe(true)
      expect(result.cip13).toBe('3400934012308')
    })

    it('should handle ]Q3 prefix', () => {
      const raw = ']Q301034009340123081723063110LOT2'
      const result = parseGs1DataMatrix(raw)

      expect(result.isGs1).toBe(true)
      expect(result.cip13).toBe('3400934012308')
    })

    it('should handle DD=00 (last day of month)', () => {
      // AI 01 (GTIN-14) + AI 17 (expiry YYMMDD=270200, DD=00) + AI 10 (batch)
      const raw = '01034009340123081727020010LOT' // February 2027, DD=00
      const result = parseGs1DataMatrix(raw)

      expect(result.expiryDate).toBe('2027-02-28')
    })

    it('should handle GS separator between variable-length fields', () => {
      const raw = '01034009340123081723063110BATCH\x1D2112345'
      const result = parseGs1DataMatrix(raw)

      expect(result.batchNumber).toBe('BATCH')
      expect(result.serialNumber).toBe('12345')
    })

    it('should return isGs1: false for non-GS1 strings', () => {
      expect(parseGs1DataMatrix('hello')).toMatchObject({ isGs1: false })
      expect(parseGs1DataMatrix('')).toMatchObject({ isGs1: false })
      expect(parseGs1DataMatrix('123')).toMatchObject({ isGs1: false })
    })

    it('should return isGs1: false for short strings', () => {
      const result = parseGs1DataMatrix('0103400')
      expect(result.isGs1).toBe(false)
    })

    it('should handle bare GTIN starting with 0340 (no AI prefix)', () => {
      // Scanner omits leading AI 01
      const raw = '034009340123081723063110LOT'
      const result = parseGs1DataMatrix(raw)

      expect(result.isGs1).toBe(true)
      expect(result.cip13).toBe('3400934012308')
    })

    it('should parse AI 17 expiry with YY >= 50 as 19YY', () => {
      const raw = '0103400934012308179912310LOT'
      const result = parseGs1DataMatrix(raw)

      expect(result.expiryDate).toBe('1999-12-31')
    })

    it('should return null expiry for invalid month', () => {
      const raw = '0103400934012308171315010LOT'
      const result = parseGs1DataMatrix(raw)

      expect(result.expiryDate).toBeNull()
    })
  })

  // ── isCip13() ──────────────────────────────────────────────────────

  describe('isCip13()', () => {
    it('should accept valid CIP13 codes starting with 340', () => {
      expect(isCip13('3400930000001')).toBe(true)
      expect(isCip13('3400934012308')).toBe(true)
    })

    it('should reject codes not starting with 340', () => {
      expect(isCip13('1234567890123')).toBe(false)
    })

    it('should reject non-13-digit strings', () => {
      expect(isCip13('340093000')).toBe(false)
      expect(isCip13('34009300000010')).toBe(false)
    })

    it('should reject non-numeric strings', () => {
      expect(isCip13('340abc0000001')).toBe(false)
    })
  })

  // ── parseScanResult() ──────────────────────────────────────────────

  describe('parseScanResult()', () => {
    it('should parse DataMatrix as source: datamatrix', () => {
      const raw = '01034009340123081723063010LOT1'
      const result = parseScanResult(raw)

      expect(result).not.toBeNull()
      expect(result!.source).toBe('datamatrix')
      expect(result!.cip13).toBe('3400934012308')
      expect(result!.expiryDate).toBe('2023-06-30')
      expect(result!.batchNumber).toBe('LOT1')
    })

    it('should parse plain CIP13 as source: barcode', () => {
      const result = parseScanResult('3400930000001')

      expect(result).not.toBeNull()
      expect(result!.source).toBe('barcode')
      expect(result!.cip13).toBe('3400930000001')
      expect(result!.expiryDate).toBeNull()
      expect(result!.batchNumber).toBeNull()
    })

    it('should trim whitespace from barcode input', () => {
      const result = parseScanResult('  3400930000001  ')

      expect(result).not.toBeNull()
      expect(result!.cip13).toBe('3400930000001')
    })

    it('should return null for unrecognized input', () => {
      expect(parseScanResult('hello world')).toBeNull()
      expect(parseScanResult('12345')).toBeNull()
      expect(parseScanResult('')).toBeNull()
    })
  })
})
