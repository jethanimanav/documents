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
  Layers,
  CheckSquare,
  Square,
} from 'lucide-react';
import type { DocItem } from '../types';
import type {
  ImageCompressionResult,
  BatchCompressionProgress,
  BatchItemResult,
  BatchImageItem,
} from '../types/compression';
import { DEFAULT_IMAGE_PRESETS } from '../types/compression';
import { compressImage, batchCompressImages } from '../services/imageCompression';
import { driveFetch } from '../services/driveFetch';
import { db } from '../services/db';
import { formatFileSize } from '../utils/folder';
import { generateOutputFilename } from '../utils/filename';
import { useAuth } from '../hooks/useAuth';

interface ImageCompressModalProps {
  doc: DocItem | null;
  isOpen: boolean;
  onClose: () => void;
  cachedBlob?: Blob | null;
}

export const ImageCompressModal: React.FC<ImageCompressModalProps> = ({
  doc,
  isOpen,
  onClose,
  cachedBlob,
}) => {
  const { needsReconnect, reconnect } = useAuth();
  const [reloadKey, setReloadKey] = useState(0);
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

  // Batch compression state
  const [compressionMode, setCompressionMode] = useState<'single' | 'batch'>('single');
  const [availableImages, setAvailableImages] = useState<DocItem[]>([]);
  const [selectedBatchDocIds, setSelectedBatchDocIds] = useState<string[]>([]);
  const [batchProgress, setBatchProgress] = useState<BatchCompressionProgress | null>(null);
  const [batchResults, setBatchResults] = useState<BatchItemResult[] | null>(null);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);

  const activeBlobUrlRef = useRef<string | null>(null);

  // Load indexed images from database for batch operations
  useEffect(() => {
    if (isOpen) {
      db.docs.toArray().then((docs) => {
        const images = docs.filter(
          (d) =>
            d.mimeType.startsWith('image/') ||
            /\.(jpe?g|png|webp|bmp|gif)$/i.test(d.name)
        );
        setAvailableImages(images);
        if (doc && !selectedBatchDocIds.includes(doc.id)) {
          setSelectedBatchDocIds([doc.id]);
        }
      });
    } else {
      setBatchResults(null);
      setBatchProgress(null);
      setIsBatchRunning(false);
      setBatchError(null);
    }
  }, [isOpen, doc]);

  const handleRunBatch = async () => {
    if (selectedBatchDocIds.length === 0) return;
    setIsBatchRunning(true);
    setBatchError(null);
    setBatchResults(null);

    try {
      const selectedDocs = availableImages.filter((d) => selectedBatchDocIds.includes(d.id));
      const itemsToProcess: BatchImageItem[] = [];

      for (const d of selectedDocs) {
        setBatchProgress({
          currentIndex: itemsToProcess.length + 1,
          totalFiles: selectedDocs.length,
          currentFilename: d.name,
          currentFilePercent: 0,
          overallPercent: Math.round((itemsToProcess.length / selectedDocs.length) * 100),
          stage: `Fetching ${d.name} from Drive...`,
        });

        let fileBlob: Blob;
        if (d.id === doc?.id && originalBlob) {
          fileBlob = originalBlob;
        } else {
          const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${d.id}?alt=media`);
          if (!res.ok) {
            throw new Error(`Failed to download ${d.name} from Google Drive (HTTP ${res.status})`);
          }
          fileBlob = await res.blob();
        }

        itemsToProcess.push({
          id: d.id,
          name: d.name,
          file: fileBlob,
        });
      }

      const results = await batchCompressImages(
        itemsToProcess,
        { targetBytes },
        (progress) => setBatchProgress(progress)
      );

      setBatchResults(results);
    } catch (err: any) {
      setBatchError(err?.message || 'Batch compression encountered an error.');
    } finally {
      setIsBatchRunning(false);
    }
  };

  const handleDownloadBatchItem = (item: BatchItemResult) => {
    if (!item.result?.blob) return;
    const url = URL.createObjectURL(item.result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = item.suggestedFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleDownloadAllBatch = () => {
    if (!batchResults) return;
    batchResults.forEach((item, idx) => {
      if (item.success && item.result?.blob) {
        setTimeout(() => handleDownloadBatchItem(item), idx * 250);
      }
    });
  };

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
        let blob = cachedBlob;
        if (!blob) {
          const res = await driveFetch(
            `https://www.googleapis.com/drive/v3/files/${doc!.id}?alt=media`
          );
          if (!res.ok) {
            throw new Error(
              `Failed to download file from Google Drive (HTTP ${res.status}: ${res.statusText})`
            );
          }
          blob = await res.blob();
        }
        if (!isCancelled) {
          setOriginalBlob(blob);
          const url = URL.createObjectURL(blob);
          setOriginalPreviewUrl(url);
          activeBlobUrlRef.current = url;
        }
      } catch (err: any) {
        if (!isCancelled) {
          setDownloadError(
            !navigator.onLine
              ? "You're offline. Original image cannot be downloaded from Google Drive until you are reconnected to the internet."
              : err.message ||
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
  }, [isOpen, doc, reloadKey]);

  // Keyboard dismissal via Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // When re-authentication completes, automatically reload the image if not loaded yet
  const prevNeedsReconnectRef = useRef(needsReconnect);
  useEffect(() => {
    if (prevNeedsReconnectRef.current && !needsReconnect && isOpen && doc && !originalBlob && !isLoadingOriginal) {
      setReloadKey((k) => k + 1);
    }
    prevNeedsReconnectRef.current = needsReconnect;
  }, [needsReconnect, isOpen, doc, originalBlob, isLoadingOriginal]);

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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-compress-title"
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))]"
    >
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between">
          <div className="min-w-0 flex-1 pr-3">
            <div className="flex items-center gap-2">
              <h2 id="image-compress-title" className="text-base font-bold text-white truncate">{doc.cleanTitle}</h2>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 shrink-0">
                {doc.name.split('.').pop()?.toUpperCase()}
              </span>
            </div>
            <p className="text-xs text-neutral-400 truncate mt-0.5">{doc.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
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
              {/* Session Reconnect Needed */}
              {needsReconnect && (
                <div className="p-4 bg-amber-950/60 border border-amber-800 rounded-xl text-xs text-amber-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Google Drive session needs reconnect. Reconnect to download or process this file.</span>
                  </div>
                  <button
                    type="button"
                    onClick={reconnect}
                    className="min-h-[36px] px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 active:bg-amber-500 text-black font-semibold rounded-lg text-xs flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Reconnect Google
                  </button>
                </div>
              )}

              {/* Mode Switch: Single Image vs Batch */}
              {availableImages.length > 1 && (
                <div className="flex items-center gap-2 bg-neutral-950 p-1 rounded-xl border border-neutral-800">
                  <button
                    type="button"
                    onClick={() => setCompressionMode('single')}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                      compressionMode === 'single'
                        ? 'bg-neutral-800 text-white shadow-xs'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    Single Image
                  </button>
                  <button
                    type="button"
                    onClick={() => setCompressionMode('batch')}
                    className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold cursor-pointer transition-colors ${
                      compressionMode === 'batch'
                        ? 'bg-neutral-800 text-white shadow-xs'
                        : 'text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <span className="flex items-center justify-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-blue-400" />
                      Batch Images ({availableImages.length})
                    </span>
                  </button>
                </div>
              )}

              {compressionMode === 'batch' ? (
                <div className="space-y-5">
                  {/* Shared Target Size Selector */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-neutral-300 flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-blue-400" />
                        <span>Shared Target Size for All Images</span>
                      </label>
                      <span className="text-xs font-mono text-blue-400 font-semibold">
                        Max: {formatFileSize(targetBytes)}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {DEFAULT_IMAGE_PRESETS.map((p) => {
                        const isSelected = selectedPresetId === p.id;
                        return (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => setSelectedPresetId(p.id)}
                            disabled={isBatchRunning}
                            className={`min-h-[38px] px-2 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-blue-600 border-blue-500 text-white shadow-md'
                                : 'bg-neutral-950 hover:bg-neutral-900 border-neutral-800 text-neutral-300'
                            }`}
                          >
                            {p.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {batchError && (
                    <div className="p-3.5 bg-red-950/40 border border-red-800 rounded-xl text-xs text-red-300">
                      {batchError}
                    </div>
                  )}

                  {/* Batch Running State */}
                  {isBatchRunning && batchProgress && (
                    <div className="p-6 bg-neutral-950 rounded-2xl border border-neutral-800 text-center space-y-4">
                      <RefreshCw className="w-7 h-7 animate-spin text-blue-400 mx-auto" />
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-white">
                          Processing Image {batchProgress.currentIndex} of {batchProgress.totalFiles}
                        </p>
                        <p className="text-xs text-neutral-400 truncate max-w-sm mx-auto">
                          {batchProgress.currentFilename}
                        </p>
                        <p className="text-[11px] text-blue-400 font-medium">
                          {batchProgress.stage}
                        </p>
                      </div>

                      {/* Overall Progress Bar */}
                      <div className="w-full bg-neutral-900 rounded-full h-2.5 overflow-hidden border border-neutral-800">
                        <div
                          className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                          style={{ width: `${batchProgress.overallPercent}%` }}
                        />
                      </div>
                      <p className="text-[11px] font-mono text-neutral-500">
                        {batchProgress.overallPercent}% Overall &bull; Memory-Safe Sequential Processing
                      </p>
                    </div>
                  )}

                  {/* Batch Results State */}
                  {!isBatchRunning && batchResults && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                          <h3 className="text-sm font-bold text-white">
                            Batch Results ({batchResults.filter((r) => r.success).length}/{batchResults.length} Successful)
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={() => setBatchResults(null)}
                          className="text-xs text-neutral-400 hover:text-white underline cursor-pointer"
                        >
                          Select different images
                        </button>
                      </div>

                      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                        {batchResults.map((item, idx) => (
                          <div
                            key={idx}
                            className="p-3 bg-neutral-950 border border-neutral-800 rounded-xl flex items-center justify-between gap-3 text-xs"
                          >
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-neutral-200 truncate">{item.name}</p>
                              {item.success && item.result ? (
                                <p className="text-[11px] text-neutral-400 mt-0.5">
                                  <span className="line-through mr-1.5">{formatFileSize(item.result.originalBytes)}</span>
                                  <span className={item.result.achievedTarget ? 'text-emerald-400 font-semibold' : 'text-amber-400'}>
                                    {formatFileSize(item.result.outputBytes)}
                                  </span>
                                  <span className="ml-1.5 text-neutral-500 font-mono">(-{item.result.reductionPercentage}%)</span>
                                </p>
                              ) : (
                                <p className="text-[11px] text-red-400 mt-0.5">{item.error || 'Failed'}</p>
                              )}
                            </div>

                            {item.success && item.result && (
                              <button
                                type="button"
                                onClick={() => handleDownloadBatchItem(item)}
                                className="px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-semibold text-xs flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
                              >
                                <Download className="w-3.5 h-3.5" />
                                <span>Download</span>
                              </button>
                            )}
                          </div>
                        ))}
                      </div>

                      <div className="pt-2 flex items-center gap-3">
                        <button
                          type="button"
                          onClick={handleDownloadAllBatch}
                          className="flex-1 min-h-[44px] px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-lg"
                        >
                          <Download className="w-4 h-4" />
                          <span>Download All Files</span>
                        </button>
                        <button
                          type="button"
                          onClick={onClose}
                          className="min-h-[44px] px-5 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded-xl font-semibold text-sm cursor-pointer transition-colors"
                        >
                          Done
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Batch Selection State */}
                  {!isBatchRunning && !batchResults && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs text-neutral-400">
                        <span>Select images to compress together:</span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedBatchDocIds(availableImages.map((d) => d.id))}
                            className="text-blue-400 hover:text-blue-300 cursor-pointer"
                          >
                            Select all
                          </button>
                          <span>&bull;</span>
                          <button
                            type="button"
                            onClick={() => setSelectedBatchDocIds([])}
                            className="text-neutral-400 hover:text-neutral-200 cursor-pointer"
                          >
                            Deselect all
                          </button>
                        </div>
                      </div>

                      <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                        {availableImages.map((imgDoc) => {
                          const isChecked = selectedBatchDocIds.includes(imgDoc.id);
                          return (
                            <button
                              key={imgDoc.id}
                              type="button"
                              onClick={() => {
                                setSelectedBatchDocIds((prev) =>
                                  prev.includes(imgDoc.id)
                                    ? prev.filter((id) => id !== imgDoc.id)
                                    : [...prev, imgDoc.id]
                                );
                              }}
                              className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                                isChecked
                                  ? 'bg-blue-950/30 border-blue-800/80 text-white'
                                  : 'bg-neutral-950 border-neutral-800/60 text-neutral-400 hover:bg-neutral-900'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0">
                                {isChecked ? (
                                  <CheckSquare className="w-4 h-4 text-blue-400 shrink-0" />
                                ) : (
                                  <Square className="w-4 h-4 text-neutral-600 shrink-0" />
                                )}
                                <span className="text-xs font-medium truncate">{imgDoc.name}</span>
                              </div>
                              <span className="text-[11px] font-mono text-neutral-500 shrink-0">
                                {formatFileSize(imgDoc.size)}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      <div className="pt-2">
                        <button
                          type="button"
                          onClick={handleRunBatch}
                          disabled={selectedBatchDocIds.length === 0}
                          className="w-full min-h-[46px] px-5 py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-neutral-800 disabled:text-neutral-600 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer transition-colors disabled:cursor-not-allowed"
                        >
                          <Sparkles className="w-4 h-4" />
                          <span>
                            Compress {selectedBatchDocIds.length} {selectedBatchDocIds.length === 1 ? 'Image' : 'Images'} to {formatFileSize(targetBytes)}
                          </span>
                        </button>
                      </div>
                    </div>
                  )}
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
                <div className="p-4 bg-red-950/40 border border-red-800 rounded-xl text-xs text-red-300 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <p className="font-semibold">Download Failed</p>
                      <p>{downloadError}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setReloadKey((k) => k + 1)}
                    className="min-h-[36px] px-3.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-white rounded-lg text-xs font-medium cursor-pointer shrink-0 transition-colors"
                  >
                    Retry Download
                  </button>
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
                      <label htmlFor="image-custom-target-kb" className="text-xs text-neutral-300 font-medium">Custom Target Size (KB)</label>
                      <div className="flex items-center gap-2">
                        <input
                          id="image-custom-target-kb"
                          aria-label="Custom target size in kilobytes"
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
            </>
          )}
        </div>
      </div>
    </div>
  );
};
