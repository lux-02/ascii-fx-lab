import { describe, it, expect } from 'vitest';
import { clamp, averageBand, positiveBandFlux } from './audioAnalysis';

describe('audioAnalysis helpers', () => {
  describe('clamp', () => {
    it('clamps below min', () => {
      expect(clamp(-1, 0, 1)).toBe(0);
    });
    it('clamps above max', () => {
      expect(clamp(2, 0, 1)).toBe(1);
    });
    it('passes through in range', () => {
      expect(clamp(0.5)).toBe(0.5);
    });
    it('uses default range 0-1', () => {
      expect(clamp(1.5)).toBe(1);
    });
  });

  describe('averageBand', () => {
    it('returns 0 for empty data', () => {
      const emptyData = new Uint8Array(0);
      expect(averageBand(emptyData, 44100, 100, 1000)).toBe(0);
    });

    it('returns 0 when frequency range is invalid', () => {
      const data = new Uint8Array(256);
      expect(averageBand(data, 44100, 50000, 60000)).toBe(0);
    });

    it('calculates average for valid range', () => {
      const data = new Uint8Array(256);
      data.fill(128); // Fill with midpoint value
      const result = averageBand(data, 44100, 100, 1000);
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThanOrEqual(1);
    });

    it('uses both mean and peak weighting', () => {
      const data = new Uint8Array(256);
      data.fill(50);
      // Add a peak but only affecting a small portion
      data[50] = 255;
      data[51] = 255;
      const result = averageBand(data, 44100, 100, 1000);

      // Should be between pure average (50/255 = 0.196) and pure peak (255/255 = 1)
      // With weights: average * 0.58 + peak * 0.42
      expect(result).toBeGreaterThan(0.196);
      expect(result).toBeLessThan(1);
    });
  });

  describe('positiveBandFlux', () => {
    it('returns 0 for empty data', () => {
      const empty = new Uint8Array(0);
      expect(positiveBandFlux(empty, empty, 44100, 100, 1000)).toBe(0);
    });

    it('returns 0 when lengths mismatch', () => {
      const data = new Uint8Array(256);
      const prev = new Uint8Array(128);
      expect(positiveBandFlux(data, prev, 44100, 100, 1000)).toBe(0);
    });

    it('returns 0 when no change', () => {
      const data = new Uint8Array(256);
      data.fill(128);
      const result = positiveBandFlux(data, data, 44100, 100, 1000);
      expect(result).toBe(0);
    });

    it('detects positive changes only', () => {
      const prev = new Uint8Array(256);
      prev.fill(50);

      const data = new Uint8Array(256);
      data.fill(50);
      // Create significant increases in the range
      for (let i = 10; i < 20; i += 1) {
        data[i] = 200;
      }
      // Decreases should be ignored
      for (let i = 100; i < 110; i += 1) {
        data[i] = 20;
      }

      const result = positiveBandFlux(data, prev, 44100, 28, 1000);
      expect(result).toBeGreaterThan(0);
    });

    it('clamps result to 0-1', () => {
      const prev = new Uint8Array(256);
      prev.fill(0);

      const data = new Uint8Array(256);
      data.fill(255); // Large change

      const result = positiveBandFlux(data, prev, 44100, 0, 22050);
      expect(result).toBeLessThanOrEqual(1);
      expect(result).toBeGreaterThanOrEqual(0);
    });
  });
});
