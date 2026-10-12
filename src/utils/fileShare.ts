/**
 * Mobile-friendly file sharing and download utilities.
 * Supports the Web Share API (with file sharing) on mobile browsers (Android Chrome, iOS Safari),
 * with safe automatic fallback to standard browser downloads.
 */

export interface ShareOrDownloadOptions {
  blob: Blob;
  filename: string;
  title?: string;
  text?: string;
}

export interface ShareResult {
  method: 'share' | 'download';
  success: boolean;
  cancelled?: boolean;
  error?: string;
}

/**
 * Checks whether the browser supports sharing files via the Web Share API.
 */
export function canWebShareFiles(): boolean {
  if (typeof navigator === 'undefined' || !navigator.share || !navigator.canShare) {
    return false;
  }
  try {
    const testFile = new File([new Uint8Array(1)], 'test.txt', { type: 'text/plain' });
    return navigator.canShare({ files: [testFile] });
  } catch {
    return false;
  }
}

/**
 * Checks whether the browser supports any Web Share API (text/url).
 */
export function canWebShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/**
 * Shares a file using the Web Share API if supported.
 * Falls back to triggering a browser download if sharing is unsupported or fails (except user cancellation).
 */
export async function shareOrDownloadFile(options: ShareOrDownloadOptions): Promise<ShareResult> {
  const { blob, filename, title = filename, text } = options;

  if (canWebShareFiles()) {
    try {
      const file = new File([blob], filename, {
        type: blob.type || 'application/octet-stream',
      });

      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title,
          text: text || `Prepared document: ${filename}`,
        });
        return { method: 'share', success: true };
      }
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        // User intentionally closed the share sheet
        return { method: 'share', success: false, cancelled: true };
      }
      console.warn('Native Web Share failed, falling back to download:', err);
    }
  }

  // Fallback: browser download
  try {
    triggerBrowserDownload(blob, filename);
    return { method: 'download', success: true };
  } catch (err: any) {
    return { method: 'download', success: false, error: err?.message || 'Download failed' };
  }
}

/**
 * Initiates an in-browser file download from a Blob and revokes the URL after completion.
 */
export function triggerBrowserDownload(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => {
    try {
      URL.revokeObjectURL(url);
    } catch {
      // Ignored
    }
  }, 2000);
}
