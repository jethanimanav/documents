import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Image as ImageIcon,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  Upload,
  Download,
  Share2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Settings2,
  Search,
} from 'lucide-react';
import type { DocItem } from '../types';
import {
  imagesToPdf,
  type ImageToPdfItem,
  type PdfToolResult,
  type PageOrientation,
  type PageMargin,
  type ImageFitMode,
} from '../services/pdfTools';
import { driveFetch } from '../services/driveFetch';
import { formatFileSize, getFileExtension } from '../utils/folder';
import { generateImagesToPdfFilename } from '../utils/filename';

interface ImagesToPdfModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableDocs: DocItem[];
  initialSelectedDoc?: DocItem | null;
}

interface SelectedImageItem {
  id: string;
  name: string;
  size: number;
  blob: Blob;
  previewUrl: string;
  source: 'drive' | 'local';
}

export const ImagesToPdfModal: React.FC<ImagesToPdfModalProps> = ({
  isOpen,
  onClose,
  availableDocs,
  initialSelectedDoc,
}) => {
  const [imageList, setImageList] = useState<SelectedImageItem[]>([]);
  const [isAddPickerOpen, setIsAddPickerOpen] = useState(false);
  const [pickerSearchQuery, setPickerSearchQuery] = useState('');

  // Conversion options
  const [orientation, setOrientation] = useState<PageOrientation>('auto');
  const [margin, setMargin] = useState<PageMargin>('normal');
  const [fit, setFit] = useState<ImageFitMode>('fit');

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [processingPercent, setProcessingPercent] = useState(0);
  const [conversionResult, setConversionResult] = useState<PdfToolResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sharing capability & download
  const [canShare, setCanShare] = useState(false);
  const [resultBlobUrl, setResultBlobUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewUrlsRef = useRef<string[]>([]);

  // Revoke preview URLs
  const cleanupPreviewUrls = () => {
    previewUrlsRef.current.forEach((url) => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignore
      }
    });
    previewUrlsRef.current = [];
  };

  // Check Web Share API
  useEffect(() => {
    if (typeof navigator !== 'undefined' && typeof navigator.canShare === 'function') {
      try {
        const dummyFile = new File([''], 'test.pdf', { type: 'application/pdf' });
        setCanShare(navigator.canShare({ files: [dummyFile] }));
      } catch {
        setCanShare(false);
      }
    }
  }, []);

  // Filter available docs to images only
  const imageDocs = availableDocs.filter((d) => {
    if (d.mimeType && d.mimeType.startsWith('image/')) return true;
    const ext = getFileExtension(d.name).toLowerCase();
    return ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif'].includes(ext);
  });

  // Reset or load initial doc when opening
  useEffect(() => {
    if (!isOpen) {
      cleanupPreviewUrls();
      if (resultBlobUrl) {
        URL.revokeObjectURL(resultBlobUrl);
        setResultBlobUrl(null);
      }
      setImageList([]);
      setConversionResult(null);
      setErrorMessage(null);
      setIsAddPickerOpen(false);
      return;
    }

    if (initialSelectedDoc) {
      // Load initial selected doc
      let isMounted = true;
      (async () => {
        try {
          const res = await driveFetch(
            `https://www.googleapis.com/drive/v3/files/${initialSelectedDoc.id}?alt=media`
          );
          if (res.ok) {
            const blob = await res.blob();
            if (isMounted) {
              const url = URL.createObjectURL(blob);
              previewUrlsRef.current.push(url);
              setImageList([
                {
                  id: initialSelectedDoc.id,
                  name: initialSelectedDoc.name,
                  size: blob.size,
                  blob,
                  previewUrl: url,
                  source: 'drive',
                },
              ]);
            }
          }
        } catch {
          // Ignore initial load failure
        }
      })();
      return () => {
        isMounted = false;
      };
    }
  }, [isOpen, initialSelectedDoc]);

  // Keyboard dismissal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isAddPickerOpen) {
          setIsAddPickerOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isAddPickerOpen, onClose]);

  // Handle local file uploads
  const handleLocalFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const newItems: SelectedImageItem[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const url = URL.createObjectURL(file);
      previewUrlsRef.current.push(url);
      newItems.push({
        id: `local-${Date.now()}-${i}`,
        name: file.name,
        size: file.size,
        blob: file,
        previewUrl: url,
        source: 'local',
      });
    }

    setImageList((prev) => [...prev, ...newItems]);
    setErrorMessage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Add doc from Google Drive library
  const handleAddDriveDoc = async (doc: DocItem) => {
    if (imageList.some((item) => item.id === doc.id)) {
      return; // Already added
    }

    try {
      const res = await driveFetch(
        `https://www.googleapis.com/drive/v3/files/${doc.id}?alt=media`
      );
      if (!res.ok) {
        throw new Error(`Failed to load "${doc.name}" from Google Drive.`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      previewUrlsRef.current.push(url);

      setImageList((prev) => [
        ...prev,
        {
          id: doc.id,
          name: doc.name,
          size: blob.size,
          blob,
          previewUrl: url,
          source: 'drive',
        },
      ]);
      setErrorMessage(null);
    } catch (err: any) {
      setErrorMessage(err.message || `Failed to add ${doc.name}`);
    }
  };

  // Move items
  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const next = [...imageList];
    const temp = next[index - 1];
    next[index - 1] = next[index];
    next[index] = temp;
    setImageList(next);
  };

  const handleMoveDown = (index: number) => {
    if (index >= imageList.length - 1) return;
    const next = [...imageList];
    const temp = next[index + 1];
    next[index + 1] = next[index];
    next[index] = temp;
    setImageList(next);
  };

  // Remove item
  const handleRemoveItem = (id: string) => {
    setImageList((prev) => prev.filter((item) => item.id !== id));
  };

  // Run conversion
  const handleConvert = async () => {
    if (imageList.length === 0) {
      setErrorMessage('Please select at least one image to convert.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage(null);
    setProcessingPercent(0);
    setProcessingStage('Preparing images...');

    try {
      const items: ImageToPdfItem[] = imageList.map((img) => ({
        id: img.id,
        name: img.name,
        blob: img.blob,
      }));

      const res = await imagesToPdf(
        items,
        {
          orientation,
          margin,
          fit,
        },
        (stage, pct) => {
          setProcessingStage(stage);
          if (pct !== undefined) setProcessingPercent(pct);
        }
      );

      const url = URL.createObjectURL(res.blob);
      setResultBlobUrl(url);
      setConversionResult(res);
    } catch (err: any) {
      console.error('Image to PDF conversion error:', err);
      setErrorMessage(err.message || 'Failed to convert images to PDF.');
    } finally {
      setIsProcessing(false);
    }
  };

  const outputFilename = generateImagesToPdfFilename(imageList[0]?.name);

  // Download
  const handleDownload = () => {
    if (!conversionResult) return;
    const a = document.createElement('a');
    a.href = resultBlobUrl || URL.createObjectURL(conversionResult.blob);
    a.download = outputFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // Share
  const handleShare = async () => {
    if (!conversionResult || !canShare) return;
    try {
      const file = new File([conversionResult.blob], outputFilename, {
        type: 'application/pdf',
      });
      await navigator.share({
        title: outputFilename,
        files: [file],
      });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Share failed:', err);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="images-to-pdf-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-200 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))]"
    >
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-2xl max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden text-neutral-100">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-500 to-orange-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <h2 id="images-to-pdf-title" className="font-bold text-base text-white">
                Convert Images to PDF
              </h2>
              <p className="text-xs text-neutral-400">
                Combine multiple photos into a single PDF document
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="w-8 h-8 flex items-center justify-center text-neutral-400 hover:text-white rounded-full hover:bg-neutral-800 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          {/* Conversion Success View */}
          {conversionResult && (
            <div className="space-y-5 animate-in fade-in zoom-in-95 duration-200">
              <div className="p-4 bg-emerald-950/40 border border-emerald-800/60 rounded-2xl flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="font-semibold text-sm text-emerald-200">
                    PDF Created Successfully!
                  </h3>
                  <p className="text-xs text-emerald-300/80">
                    Combined {conversionResult.pageCount} image{conversionResult.pageCount === 1 ? '' : 's'} into a clean, upload-ready PDF.
                  </p>
                </div>
              </div>

              {/* Stats Card */}
              <div className="bg-neutral-950/80 border border-neutral-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between text-xs pb-3 border-b border-neutral-800">
                  <span className="text-neutral-400">Output File</span>
                  <span className="font-mono text-neutral-200 font-medium">{outputFilename}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-neutral-900 p-2.5 rounded-xl border border-neutral-800/80">
                    <span className="text-[11px] text-neutral-400 block">Pages</span>
                    <span className="font-semibold text-base text-white font-mono">
                      {conversionResult.pageCount}
                    </span>
                  </div>
                  <div className="bg-neutral-900 p-2.5 rounded-xl border border-neutral-800/80">
                    <span className="text-[11px] text-neutral-400 block">Output Size</span>
                    <span className="font-semibold text-base text-white font-mono">
                      {formatFileSize(conversionResult.outputBytes)}
                    </span>
                  </div>
                  <div className="bg-neutral-900 p-2.5 rounded-xl border border-neutral-800/80">
                    <span className="text-[11px] text-neutral-400 block">Duration</span>
                    <span className="font-semibold text-base text-white font-mono">
                      {conversionResult.durationMs}ms
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex-1 min-h-[46px] px-5 py-2.5 bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-orange-950/40 transition-all"
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </button>
                {canShare && (
                  <button
                    type="button"
                    onClick={handleShare}
                    className="min-h-[46px] px-5 py-2.5 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-900 text-neutral-200 rounded-xl font-medium text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors"
                  >
                    <Share2 className="w-4 h-4" />
                    Share
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setConversionResult(null);
                    setResultBlobUrl(null);
                  }}
                  className="min-h-[46px] px-4 py-2.5 border border-neutral-800 hover:bg-neutral-800 text-neutral-300 rounded-xl font-medium text-sm flex items-center justify-center cursor-pointer transition-colors"
                >
                  Convert Another
                </button>
              </div>
            </div>
          )}

          {/* Config & Image List View */}
          {!conversionResult && (
            <>
              {/* Add Images Buttons */}
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsAddPickerOpen(true)}
                  className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors border border-neutral-700/60"
                >
                  <Plus className="w-4 h-4 text-orange-400" />
                  Add from Drive Library
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 rounded-xl text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors border border-neutral-700/60"
                >
                  <Upload className="w-4 h-4 text-amber-400" />
                  Upload from Device
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={handleLocalFilesSelected}
                  className="hidden"
                />
                <span className="text-xs text-neutral-400 ml-auto font-medium">
                  {imageList.length} {imageList.length === 1 ? 'image' : 'images'} selected
                </span>
              </div>

              {/* Conversion Settings Bar */}
              <div className="bg-neutral-950/70 border border-neutral-800 rounded-2xl p-3.5 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-neutral-300">
                  <Settings2 className="w-3.5 h-3.5 text-neutral-400" />
                  <span>PDF Page Options</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  {/* Orientation */}
                  <div className="space-y-1">
                    <label className="text-[11px] text-neutral-400 block font-medium">Orientation</label>
                    <div className="grid grid-cols-3 gap-1 bg-neutral-900 p-1 rounded-xl border border-neutral-800">
                      {(['auto', 'portrait', 'landscape'] as PageOrientation[]).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setOrientation(opt)}
                          className={`py-1 rounded-lg text-[11px] font-medium capitalize cursor-pointer transition-colors ${
                            orientation === opt
                              ? 'bg-neutral-800 text-white font-semibold shadow-xs'
                              : 'text-neutral-400 hover:text-neutral-200'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Margins */}
                  <div className="space-y-1">
                    <label className="text-[11px] text-neutral-400 block font-medium">Margin</label>
                    <div className="grid grid-cols-3 gap-1 bg-neutral-900 p-1 rounded-xl border border-neutral-800">
                      {(['none', 'small', 'normal'] as PageMargin[]).map((opt) => (
                        <button
                          key={String(opt)}
                          type="button"
                          onClick={() => setMargin(opt)}
                          className={`py-1 rounded-lg text-[11px] font-medium capitalize cursor-pointer transition-colors ${
                            margin === opt
                              ? 'bg-neutral-800 text-white font-semibold shadow-xs'
                              : 'text-neutral-400 hover:text-neutral-200'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Fit mode */}
                  <div className="space-y-1">
                    <label className="text-[11px] text-neutral-400 block font-medium">Image Fit</label>
                    <div className="grid grid-cols-2 gap-1 bg-neutral-900 p-1 rounded-xl border border-neutral-800">
                      {(['fit', 'fill'] as ImageFitMode[]).map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setFit(opt)}
                          className={`py-1 rounded-lg text-[11px] font-medium capitalize cursor-pointer transition-colors ${
                            fit === opt
                              ? 'bg-neutral-800 text-white font-semibold shadow-xs'
                              : 'text-neutral-400 hover:text-neutral-200'
                          }`}
                        >
                          {opt === 'fit' ? 'Fit Page' : 'Fill Page'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Error Banner */}
              {errorMessage && (
                <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl flex items-center gap-2 text-xs text-red-200">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Selected Images List */}
              {imageList.length === 0 ? (
                <div className="p-8 border-2 border-dashed border-neutral-800 rounded-2xl text-center space-y-2">
                  <div className="w-12 h-12 mx-auto rounded-full bg-neutral-800/80 flex items-center justify-center text-neutral-400">
                    <ImageIcon className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-semibold text-neutral-300">No images added yet</p>
                  <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                    Add images from your Google Drive library or upload from your device to combine them into a single PDF.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {imageList.map((img, index) => (
                    <div
                      key={img.id}
                      className="p-3 rounded-2xl bg-neutral-950/70 border border-neutral-800 flex items-center justify-between gap-3 group hover:border-neutral-700 transition-colors"
                    >
                      {/* Left: Thumbnail & Info */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 rounded-xl bg-neutral-900 border border-neutral-800 overflow-hidden shrink-0 flex items-center justify-center">
                          <img
                            src={img.previewUrl}
                            alt={img.name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate max-w-[200px] sm:max-w-xs">
                            {index + 1}. {img.name}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5 text-[11px] text-neutral-400">
                            <span>{formatFileSize(img.size)}</span>
                            <span>&bull;</span>
                            <span className="capitalize">{img.source}</span>
                          </div>
                        </div>
                      </div>

                      {/* Right: Reorder & Remove controls */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleMoveUp(index)}
                          disabled={index === 0}
                          aria-label={`Move ${img.name} up`}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-800 disabled:opacity-20 cursor-pointer transition-colors"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveDown(index)}
                          disabled={index === imageList.length - 1}
                          aria-label={`Move ${img.name} down`}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-800 disabled:opacity-20 cursor-pointer transition-colors"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(img.id)}
                          aria-label={`Remove ${img.name}`}
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-950/40 cursor-pointer transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Drive Image Picker Sub-Modal / Drawer */}
          {isAddPickerOpen && (
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="drive-image-picker-title"
              className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
            >
              <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl overflow-hidden text-neutral-100">
                <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
                  <h3 id="drive-image-picker-title" className="font-bold text-sm text-white">
                    Select Images from Drive
                  </h3>
                  <button
                    type="button"
                    onClick={() => setIsAddPickerOpen(false)}
                    className="w-7 h-7 flex items-center justify-center text-neutral-400 hover:text-white rounded-full hover:bg-neutral-800 cursor-pointer transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-3 border-b border-neutral-800">
                  <div className="relative">
                    <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="text"
                      value={pickerSearchQuery}
                      onChange={(e) => setPickerSearchQuery(e.target.value)}
                      placeholder="Search image documents..."
                      className="w-full pl-9 pr-3 py-2 bg-neutral-950 border border-neutral-800 rounded-xl text-xs text-white placeholder-neutral-500 focus:outline-hidden focus:border-orange-500"
                    />
                  </div>
                </div>

                <div className="p-3 overflow-y-auto space-y-1.5 flex-1">
                  {imageDocs
                    .filter((d) =>
                      d.name.toLowerCase().includes(pickerSearchQuery.toLowerCase())
                    )
                    .map((doc) => {
                      const isAdded = imageList.some((img) => img.id === doc.id);
                      return (
                        <button
                          key={doc.id}
                          type="button"
                          disabled={isAdded}
                          onClick={() => {
                            handleAddDriveDoc(doc);
                            setIsAddPickerOpen(false);
                          }}
                          className="w-full text-left p-2.5 rounded-xl bg-neutral-950/60 hover:bg-neutral-850 border border-neutral-800/80 flex items-center justify-between gap-2.5 disabled:opacity-40 cursor-pointer transition-colors"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-white truncate">
                              {doc.name}
                            </p>
                            <p className="text-[11px] text-neutral-400">
                              {formatFileSize(doc.size)}
                            </p>
                          </div>
                          {isAdded ? (
                            <span className="text-[11px] text-emerald-400 font-medium">Added</span>
                          ) : (
                            <Plus className="w-4 h-4 text-orange-400 shrink-0" />
                          )}
                        </button>
                      );
                    })}
                  {imageDocs.length === 0 && (
                    <p className="text-xs text-neutral-500 text-center py-6">
                      No image files found in your indexed Google Drive library.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer / Action Bar */}
        {!conversionResult && (
          <div className="p-4 sm:p-5 border-t border-neutral-800 bg-neutral-950/60 flex items-center justify-between gap-3 shrink-0">
            {isProcessing ? (
              <div className="w-full space-y-2">
                <div className="flex items-center justify-between text-xs text-neutral-400 font-medium">
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-3.5 h-3.5 text-orange-400 animate-spin" />
                    <span>{processingStage}</span>
                  </span>
                  <span>{processingPercent}%</span>
                </div>
                <div className="w-full bg-neutral-800 rounded-full h-1.5 overflow-hidden">
                  <div
                    className="bg-orange-500 h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${processingPercent}%` }}
                  />
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-neutral-800 hover:bg-neutral-800 text-neutral-300 text-xs font-medium cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConvert}
                  disabled={imageList.length === 0}
                  className="flex-1 sm:flex-initial px-6 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 active:bg-orange-700 disabled:opacity-40 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-orange-950/40 transition-all"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Generate PDF ({imageList.length} {imageList.length === 1 ? 'page' : 'pages'})</span>
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
