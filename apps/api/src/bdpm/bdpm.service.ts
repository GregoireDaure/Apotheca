import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { AxiosError, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { Medicine } from '../medicines/entities/medicine.entity';

/** Retry config for BDPM API calls */
const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 500,     // 500ms → 1s → 2s
  maxDelayMs: 5_000,
  retryableStatuses: new Set([429, 500, 502, 503, 504]),
} as const;

@Injectable()
export class BdpmService {
  private readonly logger = new Logger(BdpmService.name);
  private readonly baseUrl: string = 'https://medicaments-api.giygas.dev';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @InjectRepository(Medicine)
    private readonly medicineRepository: Repository<Medicine>,
  ) {
    const configUrl = this.configService.get<string>('BDPM_API_URL');
    if (configUrl) this.baseUrl = configUrl;
  }

  /**
   * Look up a medicine by CIS code (8-digit identifier).
   * Checks local cache first, then fetches from BDPM API.
   */
  async findByCis(cis: string): Promise<Medicine> {
    const code = cis.trim();

    // Check local cache first
    const cached = await this.medicineRepository.findOne({ where: { cis: code } });
    if (cached) return cached;

    // Fetch from BDPM API
    const medicineData = await this.fetchMedicineBysCis(code);
    if (!medicineData) {
      throw new NotFoundException(`Medicine with CIS ${code} not found in BDPM database.`);
    }

    const medicine = this.medicineRepository.create({
      cis: code,
      ...medicineData,
    });

    return await this.medicineRepository.save(medicine);
  }

  /**
   * Look up a medicine by either CIS or CIP13 code.
   * Auto-detects the code type based on length.
   */
  async findByCode(code: string): Promise<Medicine> {
    const trimmed = code.trim();
    if (/^\d{13}$/.test(trimmed)) {
      return this.findByCip13(trimmed);
    }
    return this.findByCis(trimmed);
  }

  /**
   * Look up a medicine by CIP13 barcode code.
   * Flow: CIP13 → /v1/presentations/{cip} → get CIS → /v1/medicaments/{cis} → full data
   */
  async findByCip13(cip13: string): Promise<Medicine> {
    // Trim whitespace and validate CIP13 format
    const code = cip13.trim();
    if (!/^\d{13}$/.test(code)) {
      throw new BadRequestException(`Invalid CIP13 code: must be exactly 13 digits. Received: "${cip13}" (length: ${cip13.length})`);
    }

    // Check local cache first (by CIP13)
    const cached = await this.medicineRepository.findOne({ where: { cip13: code } });
    if (cached) {
      return cached;
    }

    // Step 1: CIP13 → Presentation → CIS code
    const presentation = await this.fetchPresentation(code);
    if (!presentation) {
      throw new NotFoundException(`Medicine with CIP13 ${code} not found in BDPM database.`);
    }

    const cisCode = presentation.cis;

    // Check if we already have this medicine by CIS (different barcode, same medicine)
    const existingByCis = await this.medicineRepository.findOne({ where: { cis: cisCode } });
    if (existingByCis) {
      // Update the CIP13 reference if it changed
      if (existingByCis.cip13 !== code) {
        existingByCis.cip13 = code;
        await this.medicineRepository.save(existingByCis);
      }
      return existingByCis;
    }

    // Step 2: CIS → Full medicine data
    const medicineData = await this.fetchMedicineBysCis(cisCode);
    if (!medicineData) {
      throw new NotFoundException(`Medicine data for CIS ${cisCode} not found.`);
    }

    const medicine = this.medicineRepository.create({
      cis: cisCode,
      cip13: code,
      ...medicineData,
    });

    return await this.medicineRepository.save(medicine);
  }

  /**
   * Search medicines by name. Strips accents per BDPM API requirements.
   */
  async search(query: string): Promise<Partial<Medicine>[]> {
    const sanitized = this.stripAccents(query).trim();

    if (sanitized.length < 3 || sanitized.length > 50) {
      return [];
    }

    // Limit to 6 words per API constraint
    const words = sanitized.split(/\s+/).slice(0, 6).join(' ');

    try {
      const { data } = await this.fetchWithRetry(
        `${this.baseUrl}/v1/medicaments`,
        { params: { search: words } },
      );

      const results = Array.isArray(data) ? data : data?.data || [];

      return results.map((item: any) => this.mapMedicineFromApi(item));
    } catch (error) {
      this.logger.error(`Search error: ${error}`);
      return [];
    }
  }

  /**
   * Fetch presentation data by CIP13 from the BDPM API.
   */
  private async fetchPresentation(cip13: string): Promise<{ cis: string } | null> {
    try {
      const { data } = await this.fetchWithRetry(
        `${this.baseUrl}/v1/presentations/${cip13}`,
      );
      if (!data?.cis) return null;
      return { cis: String(data.cis) };
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        return null;
      }
      this.logger.error(`Presentation lookup error for CIP13 ${cip13}: ${error}`);
      return null;
    }
  }

  /**
   * Fetch full medicine data by CIS code from the BDPM API.
   */
  private async fetchMedicineBysCis(cis: string): Promise<Partial<Medicine> | null> {
    try {
      const { data } = await this.fetchWithRetry(
        `${this.baseUrl}/v1/medicaments/${cis}`,
      );

      if (!data) return null;

      return this.mapMedicineFromApi(data);
    } catch (error) {
      if (error instanceof AxiosError && error.response?.status === 404) {
        return null;
      }
      this.logger.error(`Medicine fetch error for CIS ${cis}: ${error}`);
      return null;
    }
  }

  /**
   * Map BDPM API response to our Medicine entity fields.
   */
  private mapMedicineFromApi(data: any): Partial<Medicine> {
    const composition = Array.isArray(data.composition)
      ? data.composition.map((c: any) => ({
          substance: c.denominationSubstance || c.substance || '',
          dosage: c.dosage || '',
        }))
      : undefined;

    const bdpmUrl = data.cis
      ? `https://base-donnees-publique.medicaments.gouv.fr/extrait.php?specid=${data.cis}`
      : undefined;

    return {
      cis: data.cis ? String(data.cis) : undefined,
      denomination: data.elementPharmaceutique,
      pharmaceuticalForm: data.formePharmaceutique,
      administrationRoutes: data.voiesAdministration,
      status: data.statusAutorisation,
      commercializationStatus: data.etatComercialisation,
      type: data.typeProcedure,
      composition,
      bdpmUrl,
    };
  }

  /**
   * Strip accents from a string. Required by BDPM API.
   * e.g., "ibuprofène" → "ibuprofene"
   */
  private stripAccents(str: string): string {
    return str.normalize('NFD').replaceAll(/[\u0300-\u036f]/g, '');
  }

  /**
   * HTTP GET with exponential backoff retry.
   * Retries on 429 (rate limit) and 5xx server errors.
   */
  private async fetchWithRetry<T = any>(
    url: string,
    config?: AxiosRequestConfig,
  ): Promise<AxiosResponse<T>> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
      try {
        return await firstValueFrom(
          this.httpService.get<T>(url, config),
        );
      } catch (error) {
        lastError = error;

        if (error instanceof AxiosError) {
          const status = error.response?.status;

          // Don't retry 4xx errors (except 429)
          if (status && status < 500 && status !== 429) {
            throw error;
          }

          // Don't retry if we've exhausted attempts
          if (attempt >= RETRY_CONFIG.maxRetries) {
            throw error;
          }

          // Calculate delay with exponential backoff + jitter
          const baseDelay = RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt);
          const jitter = Math.random() * baseDelay * 0.3;
          const delay = Math.min(baseDelay + jitter, RETRY_CONFIG.maxDelayMs);

          // If we got a Retry-After header (429), use it
          if (status === 429) {
            const retryAfter = error.response?.headers?.['retry-after'];
            const retryDelay = retryAfter
              ? Math.min(Number(retryAfter) * 1000, RETRY_CONFIG.maxDelayMs)
              : delay;
            this.logger.warn(
              `BDPM API rate limited (429). Retrying in ${retryDelay}ms (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries})`,
            );
            await this.sleep(retryDelay);
          } else {
            this.logger.warn(
              `BDPM API error ${status}. Retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries})`,
            );
            await this.sleep(delay);
          }
        } else {
          // Non-Axios error — don't retry
          throw error;
        }
      }
    }

    throw lastError;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
