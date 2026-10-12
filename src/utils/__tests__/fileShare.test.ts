import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  canWebShareFiles,
  canWebShare,
  shareOrDownloadFile,
  triggerBrowserDownload,
} from '../fileShare';

describe('fileShare Utility', () => {
  const originalNavigator = globalThis.navigator;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      writable: true,
      configurable: true,
    });
  });

  it('detects when Web Share API is unsupported', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      writable: true,
      configurable: true,
    });

    expect(canWebShare()).toBe(false);
    expect(canWebShareFiles()).toBe(false);
  });

  it('detects when Web Share API is supported for files', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {
        share: vi.fn(),
        canShare: vi.fn().mockReturnValue(true),
      },
      writable: true,
      configurable: true,
    });

    expect(canWebShare()).toBe(true);
    expect(canWebShareFiles()).toBe(true);
  });

  it('shares successfully using navigator.share when available', async () => {
    const shareMock = vi.fn().mockResolvedValue(undefined);
    const canShareMock = vi.fn().mockReturnValue(true);

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        share: shareMock,
        canShare: canShareMock,
      },
      writable: true,
      configurable: true,
    });

    const testBlob = new Blob(['sample data'], { type: 'application/pdf' });
    const result = await shareOrDownloadFile({
      blob: testBlob,
      filename: 'sample.pdf',
      title: 'Sample PDF',
    });

    expect(result.method).toBe('share');
    expect(result.success).toBe(true);
    expect(shareMock).toHaveBeenCalledTimes(1);
  });

  it('handles user cancellation (AbortError) cleanly without falling back to download', async () => {
    const abortError = new Error('Share canceled');
    abortError.name = 'AbortError';

    const shareMock = vi.fn().mockRejectedValue(abortError);
    const canShareMock = vi.fn().mockReturnValue(true);

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        share: shareMock,
        canShare: canShareMock,
      },
      writable: true,
      configurable: true,
    });

    const testBlob = new Blob(['sample data'], { type: 'application/pdf' });
    const result = await shareOrDownloadFile({
      blob: testBlob,
      filename: 'sample.pdf',
    });

    expect(result.method).toBe('share');
    expect(result.success).toBe(false);
    expect(result.cancelled).toBe(true);
  });

  it('falls back to browser download if native share throws an unexpected error', async () => {
    const shareMock = vi.fn().mockRejectedValue(new Error('Permission denied'));
    const canShareMock = vi.fn().mockReturnValue(true);

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        share: shareMock,
        canShare: canShareMock,
      },
      writable: true,
      configurable: true,
    });

    const clickMock = vi.fn();
    const mockElement = {
      set href(_val: string) {},
      set download(_val: string) {},
      set rel(_val: string) {},
      click: clickMock,
    };

    const appendChildMock = vi.fn();
    const removeChildMock = vi.fn();

    const originalDoc = (globalThis as any).document;
    (globalThis as any).document = {
      createElement: vi.fn().mockReturnValue(mockElement),
      body: {
        appendChild: appendChildMock,
        removeChild: removeChildMock,
      },
    };

    const testBlob = new Blob(['sample data'], { type: 'application/pdf' });
    const result = await shareOrDownloadFile({
      blob: testBlob,
      filename: 'fallback.pdf',
    });

    expect(result.method).toBe('download');
    expect(result.success).toBe(true);
    expect(clickMock).toHaveBeenCalled();
    expect(appendChildMock).toHaveBeenCalledWith(mockElement);

    (globalThis as any).document = originalDoc;
  });

  it('directly triggers browser download when Web Share is unsupported', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      writable: true,
      configurable: true,
    });

    const clickMock = vi.fn();
    const mockElement = {
      set href(_val: string) {},
      set download(_val: string) {},
      set rel(_val: string) {},
      click: clickMock,
    };

    const appendChildMock = vi.fn();
    const removeChildMock = vi.fn();

    const originalDoc = (globalThis as any).document;
    (globalThis as any).document = {
      createElement: vi.fn().mockReturnValue(mockElement),
      body: {
        appendChild: appendChildMock,
        removeChild: removeChildMock,
      },
    };

    const testBlob = new Blob(['test bytes'], { type: 'image/jpeg' });
    triggerBrowserDownload(testBlob, 'photo.jpg');

    expect(clickMock).toHaveBeenCalledTimes(1);

    (globalThis as any).document = originalDoc;
  });
});
