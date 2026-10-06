import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Sparkles,
  Download,
  Share2,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sliders,
  Shield,
  FileText,
} from 'lucide-react';
import type { DocItem } from '../types';
import type { ImageCompressionResult } from '../types/compression';
import { DEFAULT_IMAGE_PRESETS } from '../types/compression';
import { compressImage } from '../services/imageCompression';
import { driveFetch } from '../services/driveFetch';
import { formatFileSize } from '../utils/folder';
import { generateOutputFilename } from '../utils/filename';

interface ImageCompressModalProps {
  doc: DocItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ImageCompressModal: React.FC<ImageCompressModalProps> = ({
  doc,
  isOpen,
  onClose,
}) => {
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null);
  const [originalPreviewUrl, setOriginalPreviewUrl] = useState<string | null>(null);
  const [isLoadingOriginal, setIsLoadingOriginal] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Target size state
  const [selectedPresetId, setSelectedPresetId] = useState<string>('500kb');
  const [customTargetKb, setCustomTargetKb] = useState<string>('300');
  const [targetBytes, setTargetBytes] = useState<number>(500 * 1024);

  // Compression state
  const [isCompressing, setIsCompressing] = useState(false);
  const [compressionStage, setCompressionStage] = useState<string>('');
  const [compressionResult, setCompressionResult] = useState<ImageCompressionResult | null>(null);
  const [compressionError, setCompressionError] = useState<string | null>(null);
  const [resultPreviewUrl, setResultPreviewUrl] = useState<string | null>(null);

  // Sharing capability
  const [canShareFile, setCanShareFile] = useState(false);

  const activeBlobUrlRef = useRef<string | null>(null);

  // Update targetBytes when preset or custom input changes
  useEffect(() => {
    if (selectedPresetId === 'custom') {
      const kb = Number(customTargetKb);
      if (!isNaN(kb) && kb > 0) {
        setTargetBytes(Math.round(kb * 1024));
      }
    } else {
      const preset = DEFAULT_IMAGE_PRESETS.find((p) => p.id === selectedPresetId);
      if (preset) {
        setTargetBytes(preset.bytes);
      }
    }
  }, [selectedPresetId, customTargetKb]);

  // Load original image from Google Drive into browser memory on open
  useEffect(() => {
    if (!isOpen || !doc) {
      // Reset state on modal close
      setOriginalBlob(null);
      if (originalPreviewUrl) URL.revokeObjectURL(originalPreviewUrl);
      setOriginalPreviewUrl(null);
      if (resultPreviewUrl) URL.revokeObjectURL(resultPreviewUrl);
      setResultPreviewUrl(null);
      setCompressionResult(null);
      setCompressionError(null);
      setDownloadError(null);
      return;
    }

    const isImage =
      doc.mimeType.startsWith('image/') ||
      /\.(jpg|jpeg|png|webp)$/i.test(doc.name);

    if (!isImage) return;

    let isCancelled = false;
    setIsLoadingOriginal(true);
    setDownloadError(null);

    async function loadDriveImage() {
      try {
        const res = await driveFetch(
          `https://www.googleapis.com/drive/v3/files/${doc!.id}?alt=media`
        );
        if (!res.ok) {
          throw new Error(
            `Failed to download file from Google Drive (HTTP ${res.status}: ${res.statusText})`
          );
        }
        const blob = await res.blob();
        if (!isCancelled) {
          setOriginalBlob(blob);
          const url = URL.createObjectURL(blob);
          setOriginalPreviewUrl(url);
          activeBlobUrlRef.current = url;
        }
      } catch (err: any) {
        if (!isCancelled) {
          setDownloadError(
            err.message ||
              "Couldn't download this file from Google Drive. Check your connection and try again."
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingOriginal(false);
        }
      }
    }

    loadDriveImage();

    return () => {
      isCancelled = true;
      if (activeBlobUrlRef.current) {
        URL.revokeObjectURL(activeBlobUrlRef.current);
      }
    };
  }, [isOpen, doc]);

  // Check Web Share API capability
  useEffect(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.canShare === 'function') {
      try {
        const testFile = new File([''], 'test.jpg', { type: 'image/jpeg' });
        setCanShareFile(navigator.canShare({ files: [testFile] }));
      } catch {
        setCanShareFile(false);
      }
    } else {
      setCanShareFile(false);
    }
  }, []);

  if (!isOpen || !doc) return null;

  const isImageDoc =
    doc.mimeType.startsWith('image/') ||
    /\.(jpg|jpeg|png|webp)$/i.test(doc.name);

  const handleCompress = async () => {
    if (!originalBlob) return;

    setIsCompressing(true);
    setCompressionError(null);
    setCompressionStage('Preparing image...');

    try {
      const result = await compressImage({
        file: originalBlob,
        targetBytes,
        allowWebpConversion: true,
        progressCallback: (stage) => setCompressionStage(stage),
      });

      setCompressionResult(result);
      if (resultPreviewUrl) URL.revokeObjectURL(resultPreviewUrl);
      const outputUrl = URL.createObjectURL(result.blob);
      setResultPreviewUrl(outputUrl);
    } catch (err: any) {
      setCompressionError(
        err.message || "We couldn't prepare this image. Your original file is unchanged."
      );
    } finally {
      setIsCompressing(false);
    }
  };

  const handleDownload = () => {
    if (!compressionResult) return;
    const filename = generateOutputFilename(doc.name, targetBytes, compressionResult.mimeType);
    const link = document.createElement('a');
    const url = URL.createObjectURL(compressionResult.blob);
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleShare = async () => {
    if (!compressionResult || !canShareFile) return;
    try {
      const filename = generateOutputFilename(doc.name, targetBytes, compressionResult.mimeType);
      const file = new File([compressionResult.blob], filename, {
        type: compressionResult.mimeType,
      });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: doc.cleanTitle,
          text: `Prepared document: ${filename}`,
        });
      }
    } catch (err) {
      // User cancelled share or unsupported
      console.warn('Share operation cancelled or failed:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between">
          <div className="min-w-0 flex-1 pr-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-bold text-white truncate">{doc.cleanTitle}</h2>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 shrink-0">
                {doc.name.split('.').pop()?.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-neutral-400 truncate mt-0.5">{doc.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-6">
          {/* Non-image notice (e.g. PDF) */}
          {!isImageDoc ? (
            <div className="bg-neutral-950 p-6 rounded-2xl border border-neutral-800 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-blue-950/60 border border-blue-800 text-blue-400 flex items-center justify-center mx-auto">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="font-semibold text-sm text-neutral-100">PDF Document Selected</h3>
              <p className="text-xs text-neutral-400 max-w-md mx-auto">
                Step 3 implements image compression (JPG, PNG, WebP). PDF compression and page tools will be unlocked in Step 4.
              </p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] px-6 py-2 bg-neutral-800 hover:bg-neutral-700 text-white rounded-xl text-xs font-medium cursor-pointer"
                >
                  Back to Documents
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Drive Download Loader / Error */}
              {isLoadingOriginal && (
                <div className="p-6 bg-neutral-950 rounded-2xl border border-neutral-800 text-center space-y-3">
                  <RefreshCw className="w-6 h-6 animate-spin text-blue-400 mx-auto" />
                  <p className="text-xs text-neutral-300 font-medium">
                    Downloading image from Google Drive into browser memory...
                  </p>
                  <p className="text-[11px] text-neutral-500">
                    Transferred securely directly from Google's servers.
                  </p>
                </div>
              )}

              {downloadError && (
                <div className="p-4 bg-red-950/40 border border-red-800 rounded-xl text-xs text-red-300 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold">Download Failed</p>
                    <p>{downloadError}</p>
                  </div>
                </div>
              )}

              {/* Original Preview & Info */}
              {originalPreviewUrl && !isLoadingOriginal && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-neutral-950 p-3.5 sm:p-4 rounded-2xl border border-neutral-800">
                  <div className="relative aspect-video sm:aspect-square bg-neutral-900 rounded-xl overflow-hidden flex items-center justify-center border border-neutral-800">
                    <img
                      src={originalPreviewUrl}
                      alt="Original"
                      className="w-full h-full object-contain"
                    />
                  </div>

                  <div className="sm:col-span-2 flex flex-col justify-between py-1 space-y-3">
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Original Size:</span>
                        <strong className="text-neutral-100 font-mono text-sm">
                          {formatFileSize(doc.size)}
                        </strong>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Category:</span>
                        <span className="text-blue-400 font-medium">{doc.category}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-neutral-400">Folder Path:</span>
                        <span className="text-neutral-300 truncate max-w-[180px]" title={doc.folderPath}>
                          {doc.folderPath}
                        </span>
                      </div>
                    </div>

                    {/* Security notice */}
                    <div className="flex items-center gap-2 p-2 rounded-lg bg-neutral-900/80 border border-neutral-800 text-[11px] text-emerald-400">
                      <Shield className="w-3.5 h-3.5 shrink-0" />
                      <span>Original file in Google Drive is unchanged.</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Target Size Selection Form */}
              {originalBlob && !isLoadingOriginal && !compressionResult && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold uppercase tracking-wider text-neutral-300 flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-blue-400" />
                      <span>Choose Target Upload Size</span>
                    </label>
                    <span className="text-xs text-neutral-400">
                      Target: <strong className="text-blue-400 font-mono">{formatFileSize(targetBytes)}</strong>
                    </span>
                  </div>

                  {/* Preset Pills */}
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {DEFAULT_IMAGE_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setSelectedPresetId(preset.id)}
                        className={`min-h-[44px] px-2 py-2 rounded-xl text-xs font-medium cursor-pointer transition-all border text-center flex flex-col items-center justify-center ${
                          selectedPresetId === preset.id
                            ? 'bg-blue-600 text-white border-blue-500 shadow-md'
                            : 'bg-neutral-950 hover:bg-neutral-850 text-neutral-300 border-neutral-800'
                        }`}
                      >
                        <span>{preset.label}</span>
                      </button>
                    ))}

                    {/* Custom Button */}
                    <button
                      type="button"
                      onClick={() => setSelectedPresetId('custom')}
                      className={`min-h-[44px] px-2 py-2 rounded-xl text-xs font-medium cursor-pointer transition-all border text-center flex flex-col items-center justify-center ${
                        selectedPresetId === 'custom'
                          ? 'bg-blue-600 text-white border-blue-500 shadow-md'
                          : 'bg-neutral-950 hover:bg-neutral-850 text-neutral-300 border-neutral-800'
                      }`}
                    >
                      <span>Custom</span>
                    </button>
                  </div>

                  {/* Custom Target Input */}
                  {selectedPresetId === 'custom' && (
                    <div className="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800 space-y-2">
                      <label className="text-xs text-neutral-300 font-medium">Custom Target Size (KB)</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="10"
                          max="20000"
                          value={customTargetKb}
                          onChange={(e) => setCustomTargetKb(e.target.value)}
                          placeholder="e.g. 250"
                          className="flex-1 bg-neutral-900 border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white font-mono outline-none focus:border-blue-500"
                        />
                        <span className="text-xs text-neutral-400 font-mono">KB</span>
                      </div>
                    </div>
                  )}

                  {/* Prepare Button */}
                  <button
                    type="button"
                    onClick={handleCompress}
                    disabled={isCompressing}
                    className="w-full min-h-[48px] px-5 py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-colors disabled:opacity-50"
                  >
                    {isCompressing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>{compressionStage || 'Processing image...'}</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Prepare for Upload ({formatFileSize(targetBytes)})</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* Compression Error */}
              {compressionError && (
                <div className="p-4 bg-red-950/40 border border-red-800 rounded-xl text-xs text-red-300 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold">Compression Error</p>
                    <p>{compressionError}</p>
                  </div>
                </div>
              )}

              {/* Output Result Screen */}
              {compressionResult && resultPreviewUrl && (
                <div className="space-y-5 animate-in fade-in duration-200">
                  {/* Status Banner */}
                  <div
                    className={`p-3.5 rounded-xl text-xs flex items-center justify-between border ${
                      compressionResult.achievedTarget
                        ? 'bg-emerald-950/40 border-emerald-800 text-emerald-300'
                        : 'bg-amber-950/40 border-amber-800 text-amber-300'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {compressionResult.achievedTarget ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                      )}
                      <span className="font-medium">
                        {compressionResult.achievedTarget
                          ? 'Target size achieved successfully'
                          : 'Target could not be reached without excessive quality loss'}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] opacity-80">
                      -{compressionResult.reductionPercentage}%
                    </span>
                  </div>

                  {/* Output Preview */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="relative aspect-video sm:aspect-square bg-neutral-950 rounded-xl overflow-hidden flex items-center justify-center border border-neutral-800 group">
                      <img
                        src={resultPreviewUrl}
                        alt="Compressed Output"
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 text-[10px] text-neutral-300 font-mono">
                        {compressionResult.width} × {compressionResult.height} px
                      </div>
                    </div>

                    {/* Result Metrics */}
                    <div className="bg-neutral-950 p-4 rounded-xl border border-neutral-800 flex flex-col justify-between space-y-3 text-xs">
                      <div className="space-y-2">
                        <div className="flex justify-between items-center pb-2 border-b border-neutral-800">
                          <span className="text-neutral-400">Original:</span>
                          <span className="font-mono text-neutral-300 line-through">
                            {formatFileSize(compressionResult.originalBytes)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-neutral-400">Target Maximum:</span>
                          <span className="font-mono text-blue-400">{formatFileSize(targetBytes)}</span>
                        </div>

                        <div className="flex justify-between items-center text-sm font-semibold">
                          <span className="text-neutral-200">Output Size:</span>
                          <span
                            className={`font-mono ${
                              compressionResult.achievedTarget ? 'text-emerald-400' : 'text-amber-400'
                            }`}
                          >
                            {formatFileSize(compressionResult.outputBytes)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center">
                          <span className="text-neutral-400">Format:</span>
                          <span className="font-mono uppercase text-neutral-200">
                            {compressionResult.mimeType.split('/').pop()}
                          </span>
                        </div>

                        {compressionResult.formatConverted && (
                          <p className="text-[11px] text-blue-300 bg-blue-950/40 p-1.5 rounded border border-blue-900/40">
                            Converted PNG to WebP to preserve transparency while meeting target.
                          </p>
                        )}

                        <div className="flex justify-between items-center">
                          <span className="text-neutral-400">Quality / Scale:</span>
                          <span className="font-mono text-neutral-300">
                            {Math.round(compressionResult.quality * 100)}% &bull; {Math.round(compressionResult.scale * 100)}% scale
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setCompressionResult(null)}
                        className="text-xs text-neutral-400 hover:text-white underline cursor-pointer text-left"
                      >
                        Adjust target size & re-run
                      </button>
                    </div>
                  </div>

                  {/* Primary Download & Share Buttons */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="min-h-[48px] px-5 py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-colors"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download ({formatFileSize(compressionResult.outputBytes)})</span>
                    </button>

                    {canShareFile ? (
                      <button
                        type="button"
                        onClick={handleShare}
                        className="min-h-[48px] px-5 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 border border-neutral-700 cursor-pointer transition-colors"
                      >
                        <Share2 className="w-4 h-4" />
                        <span>Share Document</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={onClose}
                        className="min-h-[48px] px-5 py-3 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 border border-neutral-700 cursor-pointer transition-colors"
                      >
                        <span>Done</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
