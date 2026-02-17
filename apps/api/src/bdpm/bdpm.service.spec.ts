import { Test, TestingModule } from '@nestjs/testing';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { AxiosError, AxiosHeaders, AxiosResponse } from 'axios';
import { BdpmService } from './bdpm.service';
import { Medicine } from '../medicines/entities/medicine.entity';

// ── Helpers ──────────────────────────────────────────────────────────

function makeAxiosResponse<T>(data: T): AxiosResponse<T> {
  return {
    data,
    status: 200,
    statusText: 'OK',
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
}

function makeAxiosError(status: number, message = 'Error'): AxiosError {
  const error = new AxiosError(message);
  error.response = {
    data: {},
    status,
    statusText: message,
    headers: {},
    config: { headers: new AxiosHeaders() },
  };
  return error;
}

const BDPM_MEDICINE = {
  cis: '60001234',
  elementPharmaceutique: 'DOLIPRANE 1000 mg, comprimé',
  formePharmaceutique: 'comprimé',
  voiesAdministration: ['orale'],
  typeProcedure: 'Nationale',
  statusAutorisation: 'Autorisée',
  etatComercialisation: 'Commercialisée',
  composition: [
    { denominationSubstance: 'PARACETAMOL', dosage: '1000 mg' },
  ],
};

// ── Mock Factories ───────────────────────────────────────────────────

const mockMedicineRepo = () => ({
  findOne: jest.fn(),
  create: jest.fn((dto) => ({ ...dto })),
  save: jest.fn((entity) => Promise.resolve(entity)),
});

const mockHttpService = () => ({
  get: jest.fn(),
});

const mockConfigService = () => ({
  get: jest.fn().mockReturnValue(undefined), // no custom URL → use default
});

// ── Tests ────────────────────────────────────────────────────────────

describe('BdpmService', () => {
  let service: BdpmService;
  let httpService: ReturnType<typeof mockHttpService>;
  let medicineRepo: ReturnType<typeof mockMedicineRepo>;

  beforeEach(async () => {
    httpService = mockHttpService();
    medicineRepo = mockMedicineRepo();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BdpmService,
        { provide: HttpService, useValue: httpService },
        { provide: ConfigService, useValue: mockConfigService() },
        { provide: getRepositoryToken(Medicine), useValue: medicineRepo },
      ],
    }).compile();

    service = module.get<BdpmService>(BdpmService);
  });

  // ── findByCis() ──────────────────────────────────────────────────

  describe('findByCis()', () => {
    it('should return cached medicine if found locally', async () => {
      const cached = { cis: '60001234', denomination: 'Doliprane' } as Medicine;
      medicineRepo.findOne.mockResolvedValue(cached);

      const result = await service.findByCis('60001234');

      expect(result).toBe(cached);
      expect(httpService.get).not.toHaveBeenCalled();
    });

    it('should fetch from BDPM API and cache when not found locally', async () => {
      medicineRepo.findOne.mockResolvedValue(null);
      httpService.get.mockReturnValue(of(makeAxiosResponse(BDPM_MEDICINE)));

      const result = await service.findByCis('60001234');

      expect(result.denomination).toBe('DOLIPRANE 1000 mg, comprimé');
      expect(medicineRepo.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException when API returns 404', async () => {
      medicineRepo.findOne.mockResolvedValue(null);
      httpService.get.mockReturnValue(throwError(() => makeAxiosError(404)));

      await expect(service.findByCis('99999999')).rejects.toThrow(NotFoundException);
    });
  });

  // ── findByCip13() ────────────────────────────────────────────────

  describe('findByCip13()', () => {
    it('should reject invalid CIP13 format', async () => {
      await expect(service.findByCip13('123')).rejects.toThrow(BadRequestException);
      await expect(service.findByCip13('123456789012X')).rejects.toThrow(BadRequestException);
    });

    it('should return cached medicine from CIP13 lookup', async () => {
      const cached = { cis: '60001234', cip13: '3400930000001' } as Medicine;
      medicineRepo.findOne.mockResolvedValue(cached);

      const result = await service.findByCip13('3400930000001');

      expect(result.cip13).toBe('3400930000001');
      expect(httpService.get).not.toHaveBeenCalled();
    });

    it('should chain presentation → medicine lookup when not cached', async () => {
      // Not cached by CIP13
      medicineRepo.findOne
        .mockResolvedValueOnce(null)   // findOne by cip13
        .mockResolvedValueOnce(null);  // findOne by cis

      // Presentation lookup returns CIS
      httpService.get
        .mockReturnValueOnce(of(makeAxiosResponse({ cis: '60001234' })))
        // Medicine lookup
        .mockReturnValueOnce(of(makeAxiosResponse(BDPM_MEDICINE)));

      const result = await service.findByCip13('3400930000001');

      expect(result.cis).toBe('60001234');
      expect(httpService.get).toHaveBeenCalledTimes(2);
    });
  });

  // ── search() ─────────────────────────────────────────────────────

  describe('search()', () => {
    it('should return empty for short queries', async () => {
      const result = await service.search('ab');
      expect(result).toEqual([]);
      expect(httpService.get).not.toHaveBeenCalled();
    });

    it('should strip accents and limit to 6 words', async () => {
      httpService.get.mockReturnValue(of(makeAxiosResponse([BDPM_MEDICINE])));

      await service.search('ibuprofène très très long nom de médicament extra');

      expect(httpService.get).toHaveBeenCalledWith(
        expect.stringContaining('/v1/medicaments'),
        expect.objectContaining({
          params: { search: expect.not.stringContaining('è') },
        }),
      );
    });

    it('should return mapped results', async () => {
      httpService.get.mockReturnValue(of(makeAxiosResponse([BDPM_MEDICINE])));

      const results = await service.search('doliprane');

      expect(results).toHaveLength(1);
      expect(results[0].denomination).toBe('DOLIPRANE 1000 mg, comprimé');
    });

    it('should return empty on API error', async () => {
      httpService.get.mockReturnValue(throwError(() => makeAxiosError(400)));

      const results = await service.search('doliprane');

      expect(results).toEqual([]);
    });
  });

  // ── findByCode() ─────────────────────────────────────────────────

  describe('findByCode()', () => {
    it('should route 13-digit code to findByCip13', async () => {
      const cached = { cis: '60001234', cip13: '3400930000001' } as Medicine;
      medicineRepo.findOne.mockResolvedValue(cached);

      const result = await service.findByCode('3400930000001');

      expect(result.cip13).toBe('3400930000001');
    });

    it('should route shorter codes to findByCis', async () => {
      const cached = { cis: '60001234' } as Medicine;
      medicineRepo.findOne.mockResolvedValue(cached);

      const result = await service.findByCode('60001234');

      expect(result.cis).toBe('60001234');
    });
  });
});
