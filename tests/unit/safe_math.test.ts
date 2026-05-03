import { describe, it, expect } from 'vitest';

import {
  safeAdd,
  safeSub,
  safeMul,
  safeDiv,
  toStroops,
  fromStroops,
  MAX_U64,
} from '../../src/utils/safe_math.js';

describe('SafeMath Utilities', () => {
  describe('safeAdd', () => {
    it('should add two numbers correctly', () => {
      expect(safeAdd(10n, 20n)).toBe(30n);
    });

    it('should throw on overflow', () => {
      try {
        safeAdd(MAX_U64, 1n, 0n, MAX_U64);
        expect.fail('Should have thrown');
      } catch (e: unknown) {
        expect((e as { code: string }).code).toBe('MATH_ERROR');
      }
    });
  });

  describe('safeSub', () => {
    it('should subtract two numbers correctly', () => {
      expect(safeSub(30n, 10n)).toBe(20n);
    });

    it('should throw on underflow', () => {
      try {
        safeSub(0n, 1n, 0n, MAX_U64);
        expect.fail('Should have thrown');
      } catch (e: unknown) {
        expect((e as { code: string }).code).toBe('MATH_ERROR');
      }
    });
  });

  describe('safeMul', () => {
    it('should multiply two numbers correctly', () => {
      expect(safeMul(10n, 20n)).toBe(200n);
    });

    it('should throw on overflow', () => {
      try {
        safeMul(MAX_U64 / 2n, 3n, 0n, MAX_U64);
        expect.fail('Should have thrown');
      } catch (e: any) {
        expect(e.code).toBe('MATH_ERROR');
      }
    });
  });

  describe('safeDiv', () => {
    it('should divide two numbers correctly', () => {
      expect(safeDiv(200n, 10n)).toBe(20n);
    });

    it('should throw on division by zero', () => {
      expect(() => safeDiv(100n, 0n)).toThrow('Division by zero');
    });
  });

  describe('Stroop Conversions', () => {
    it('should convert XLM to stroops correctly', () => {
      expect(toStroops(1.0)).toBe(10000000n);
      expect(toStroops(0.0000001)).toBe(1n);
      expect(toStroops(123.456789)).toBe(1234567890n);
    });

    it('should convert stroops to XLM correctly', () => {
      expect(fromStroops(10000000n)).toBe(1.0);
      expect(fromStroops(1n)).toBe(0.0000001);
    });
  });
});
