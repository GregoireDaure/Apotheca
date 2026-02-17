/**
 * GS1 DataMatrix parser for French medicine packaging.
 *
 * French pharmaceutical DataMatrix codes follow the GS1 standard with
 * Application Identifiers (AIs):
 *
 *   AI 01 – GTIN-14 (14 digits) → last 13 digits = CIP13
 *   AI 17 – Expiry date (YYMMDD)
 *   AI 10 – Batch/Lot number (variable length, up to 20 chars)
 *   AI 21 – Serial number (variable length, up to 20 chars)
 *
 * The raw scanned string uses GS1 Group Separator (ASCII 29, \x1D) or
 * the FNC1 prefix (]d2) to delimit variable-length fields.
 *
 * Example raw scan:
 *   01034009340123081723063110ABC123\x1D2112345
 *   → GTIN: 03400934012308
 *   → CIP13: 3400934012308
 *   → Expiry: 2023-06-30 (YYMMDD → last day of month if DD=00)
 *   → Batch: ABC123
 *   → Serial: 12345
 */

export interface Gs1ParseResult {
  /** CIP13 code extracted from GTIN-14 (AI 01) */
  cip13: string | null;
  /** Expiry date as YYYY-MM-DD string (AI 17) */
  expiryDate: string | null;
  /** Batch/Lot number (AI 10) */
  batchNumber: string | null;
  /** Serial number (AI 21) */
  serialNumber: string | null;
  /** Full GTIN-14 as scanned */
  gtin: string | null;
  /** Whether the code was recognised as GS1 format */
  isGs1: boolean;
}

// Fixed-length AIs: AI code → data length (digits)
const FIXED_LENGTH_AIS: Record<string, number> = {
  "01": 14, // GTIN-14
  "02": 14, // GTIN of contained items
  "17": 6,  // Expiry date YYMMDD
  "11": 6,  // Production date
  "13": 6,  // Packaging date
  "15": 6,  // Best-before date
  "16": 6,  // Sell-by date
};

// Variable-length AIs we care about
const VARIABLE_AIS = new Set(["10", "21", "22", "30", "37"]);

// GS1 Group Separator character (ASCII 29)
const GS = "\x1D";

/** Strip FNC1 symbology prefix from raw scanner output */
function stripFnc1Prefix(data: string): string {
  if (data.startsWith("]d2") || data.startsWith("]Q3") || data.startsWith("]C1")) {
    return data.slice(3);
  }
  return data;
}

/** Ensure AI 01 prefix is present; returns null if not a GS1 string */
function ensureAi01Prefix(data: string): string | null {
  if (data.startsWith("01")) return data;
  // Some scanners omit leading AI — check for bare GTIN starting with 0340 (French CIP13)
  if (/^0340\d{10}/.test(data)) return "01" + data;
  return null;
}

/** Extract CIP13 from a 14-digit GTIN (strip leading indicator digit) */
function gtinToCip13(gtin: string): string | null {
  return gtin.length === 14 ? gtin.slice(1, 14) : null;
}

/** Process a fixed-length AI segment and update the result object */
function processFixedAi(
  ai: string,
  value: string,
  result: Gs1ParseResult
): void {
  if (ai === "01") {
    result.gtin = value;
    result.cip13 = gtinToCip13(value);
  } else if (ai === "17") {
    result.expiryDate = parseGs1Date(value);
  }
}

/** Process a variable-length AI segment and update the result object */
function processVariableAi(ai: string, value: string, result: Gs1ParseResult): void {
  if (ai === "10") {
    result.batchNumber = value;
  } else if (ai === "21") {
    result.serialNumber = value;
  }
}

/** Read a variable-length field until GS separator or end of string */
function readVariableField(data: string, pos: number): { value: string; nextPos: number } {
  const gsPos = data.indexOf(GS, pos);
  const endPos = gsPos === -1 ? data.length : gsPos;
  return {
    value: data.slice(pos, endPos),
    nextPos: gsPos === -1 ? data.length : gsPos + 1,
  };
}

/**
 * Parse a GS1 DataMatrix string into structured fields.
 */
export function parseGs1DataMatrix(raw: string): Gs1ParseResult {
  const empty: Gs1ParseResult = {
    cip13: null,
    expiryDate: null,
    batchNumber: null,
    serialNumber: null,
    gtin: null,
    isGs1: false,
  };

  if (!raw || raw.length < 16) return empty;

  const stripped = stripFnc1Prefix(raw);
  const data = ensureAi01Prefix(stripped);
  if (!data) return empty;

  const result: Gs1ParseResult = { ...empty, isGs1: true };

  let pos = 0;
  while (pos < data.length) {
    const ai = data.slice(pos, pos + 2);

    if (FIXED_LENGTH_AIS[ai] !== undefined) {
      const len = FIXED_LENGTH_AIS[ai];
      processFixedAi(ai, data.slice(pos + 2, pos + 2 + len), result);
      pos += 2 + len;
    } else if (VARIABLE_AIS.has(ai)) {
      const { value, nextPos } = readVariableField(data, pos + 2);
      processVariableAi(ai, value, result);
      pos = nextPos;
    } else {
      break; // Unknown AI — stop parsing
    }
  }

  return result;
}

/**
 * Parse a GS1 date (YYMMDD) into an ISO date string (YYYY-MM-DD).
 *
 * GS1 convention: DD=00 means last day of the month.
 * YY < 50 → 20YY; YY >= 50 → 19YY (standard GS1 interpretation, though
 * for medicines manufactured in 2020s-2040s, all will be 20YY).
 */
function parseGs1Date(yymmdd: string): string | null {
  if (yymmdd.length !== 6) return null;

  const yy = Number.parseInt(yymmdd.slice(0, 2), 10);
  const mm = Number.parseInt(yymmdd.slice(2, 4), 10);
  let dd = Number.parseInt(yymmdd.slice(4, 6), 10);

  if (Number.isNaN(yy) || Number.isNaN(mm) || Number.isNaN(dd)) return null;
  if (mm < 1 || mm > 12) return null;

  const year = yy < 50 ? 2000 + yy : 1900 + yy;

  // DD=00 → last day of the month
  if (dd === 0) {
    dd = new Date(year, mm, 0).getDate(); // day 0 of next month = last day of this month
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${year}-${pad(mm)}-${pad(dd)}`;
}

/**
 * Determine if a raw scan string is a plain CIP13 barcode (EAN-13).
 * French CIP13 codes always start with "340".
 */
export function isCip13(code: string): boolean {
  return /^\d{13}$/.test(code) && code.startsWith("340");
}

/**
 * Extract a CIP13 from any scanned code — handles both GS1 DataMatrix
 * and plain EAN-13 barcodes.
 */
export interface ScanResult {
  cip13: string;
  expiryDate: string | null;
  batchNumber: string | null;
  source: "datamatrix" | "barcode";
}

export function parseScanResult(rawCode: string): ScanResult | null {
  // First, try GS1 DataMatrix
  const gs1 = parseGs1DataMatrix(rawCode);
  if (gs1.isGs1 && gs1.cip13) {
    return {
      cip13: gs1.cip13,
      expiryDate: gs1.expiryDate,
      batchNumber: gs1.batchNumber,
      source: "datamatrix",
    };
  }

  // Then, try plain CIP13 barcode
  const cleaned = rawCode.trim();
  if (isCip13(cleaned)) {
    return {
      cip13: cleaned,
      expiryDate: null,
      batchNumber: null,
      source: "barcode",
    };
  }

  return null;
}
