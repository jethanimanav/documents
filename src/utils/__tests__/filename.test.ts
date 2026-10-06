import { describe, it, expect } from 'vitest';
import {
  formatTargetLabel,
  generateOutputFilename,
  getExtensionForMimeType,
} from '../filename';

describe('Filename and Target Size Label Utilities', () => {
  describe('formatTargetLabel', () => {
    it('formats exact KB and MB targets', () => {
      expect(formatTargetLabel(100 * 1024)).toBe('100KB');
      expect(formatTargetLabel(200 * 1024)).toBe('200KB');
      expect(formatTargetLabel(500 * 1024)).toBe('500KB');
      expect(formatTargetLabel(1024 * 1024)).toBe('1MB');
      expect(formatTargetLabel(2 * 1024 * 1024)).toBe('2MB');
    });

    it('formats non-round byte counts gracefully', () => {
      expect(formatTargetLabel(350 * 1024)).toBe('350KB');
      expect(formatTargetLabel(1536 * 1024)).toBe('1.5MB');
    });

    it('handles 0 or negative values', () => {
      expect(formatTargetLabel(0)).toBe('Custom');
      expect(formatTargetLabel(-100)).toBe('Custom');
    });
  });

  describe('getExtensionForMimeType', () => {
    it('maps MIME types to standard file extensions', () => {
      expect(getExtensionForMimeType('image/jpeg')).toBe('jpg');
      expect(getExtensionForMimeType('image/jpg')).toBe('jpg');
      expect(getExtensionForMimeType('image/png')).toBe('png');
      expect(getExtensionForMimeType('image/webp')).toBe('webp');
      expect(getExtensionForMimeType('application/pdf')).toBe('pdf');
    });
  });

  describe('generateOutputFilename', () => {
    it('formats photo.jpg with 500 KB target', () => {
      expect(generateOutputFilename('photo.jpg', 500 * 1024, 'image/jpeg')).toBe(
        'photo_500KB.jpg'
      );
    });

    it('normalizes photo.jpeg to .jpg extension', () => {
      expect(generateOutputFilename('photo.jpeg', 200 * 1024, 'image/jpeg')).toBe(
        'photo_200KB.jpg'
      );
    });

    it('formats multi-dot filename document.final.v2.jpg with 1 MB target', () => {
      expect(
        generateOutputFilename('document.final.v2.jpg', 1024 * 1024, 'image/jpeg')
      ).toBe('document.final.v2_1MB.jpg');
    });

    it('converts extension when PNG is converted to WebP', () => {
      expect(generateOutputFilename('scan.png', 500 * 1024, 'image/webp')).toBe(
        'scan_500KB.webp'
      );
    });

    it('preserves PDF extension if applicable', () => {
      expect(
        generateOutputFilename('Test_Aadhar.pdf', 500 * 1024, 'application/pdf')
      ).toBe('Test_Aadhar_500KB.pdf');
    });

    it('handles files with no extension', () => {
      expect(generateOutputFilename('ScannedDocument', 200 * 1024, 'image/jpeg')).toBe(
        'ScannedDocument_200KB.jpg'
      );
    });
  });
});
