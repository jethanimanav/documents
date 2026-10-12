import React, { useState, useEffect } from 'react';
import {
  X,
  Layers,
  ArrowUp,
  ArrowDown,
  Trash2,
  Plus,
  FileText,
  Download,
  Share2,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  GripVertical,
  Check,
  Search,
} from 'lucide-react';
import type { DocItem } from '../types';
import { mergePdfs, type MergeSourceItem, type PdfToolResult } from '../services/pdfTools';
import { driveFetch } from '../services/driveFetch';
import { formatFileSize } from '../utils/folder';
import { generateMergedFilename } from '../utils/filename';

interface PdfMergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableDocs: DocItem[];
  initialSelectedDoc?: DocItem | null;
}

interface QueuedPdfItem {
  id: string;
  name: string;
  cleanTitle: string;
  size: number;
  blob?: Blob;
  pageCount?: number;
}

export const PdfMergeModal: React.FC<PdfMergeModalProps> = ({
  isOpen,
  onClose,
  availableDocs,
  initialSelectedDoc,
}) => {
  // Queue of PDFs to merge in order
  const [queue, setQueue] = useState<QueuedPdfItem[]>([]);
  const [isAddPickerOpen, setIsAddPickerOpen] = useState(false);
  const [pickerSearchQuery, setPickerSearchQuery] = useState('');

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [processingPercent, setProcessingPercent] = useState(0);
  const [mergeResult, setMergeResult] = useState<PdfToolResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sharing capability
  const [canShare, setCanShare] = useState(false);
  const [resultBlobUrl, setResultBlobUrl] = useState<string | null>(null);

  // Filter available docs to PDFs only
  const pdfDocs = availableDocs.filter(
    (d) => d.mimeType === 'application/pdf' || /\.pdf$/i.test(d.name)
  );

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

  // Keyboard dismissal via Escape key
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

  // Initialize queue when modal opens
  useEffect(() => {
    if (isOpen) {
      setMergeResult(null);
      setErrorMessage(null);
      setProcessingStage('');
      setProcessingPercent(0);

      if (initialSelectedDoc) {
        setQueue([
          {
            id: initialSelectedDoc.id,
            name: initialSelectedDoc.name,
            cleanTitle: initialSelectedDoc.cleanTitle,
            size: initialSelectedDoc.size,
          },
        ]);
      } else {
        setQueue([]);
      }
    }
  }, [isOpen, initialSelectedDoc]);

  // Clean up blob URL
  useEffect(() => {
    return () => {
      if (resultBlobUrl) {
        URL.revokeObjectURL(resultBlobUrl);
      }
    };
  }, [resultBlobUrl]);

  if (!isOpen) return null;

  // Queue manipulation
  const handleMoveUp = (index: number) => {
    if (index <= 0) return;
    const newQueue = [...queue];
    const temp = newQueue[index - 1];
    newQueue[index - 1] = newQueue[index];
    newQueue[index] = temp;
    setQueue(newQueue);
  };

  const handleMoveDown = (index: number) => {
    if (index >= queue.length - 1) return;
    const newQueue = [...queue];
    const temp = newQueue[index + 1];
    newQueue[index + 1] = newQueue[index];
    newQueue[index] = temp;
    setQueue(newQueue);
  };

  const handleRemove = (index: number) => {
    setQueue(queue.filter((_, i) => i !== index));
  };

  const handleClearAll = () => {
    setQueue([]);
    setMergeResult(null);
    setErrorMessage(null);
  };

  const handleToggleAddDoc = (doc: DocItem) => {
    const isAlreadyIn = queue.some((item) => item.id === doc.id);
    if (isAlreadyIn) {
      setQueue(queue.filter((item) => item.id !== doc.id));
    } else {
      setQueue([
        ...queue,
        {
          id: doc.id,
          name: doc.name,
          cleanTitle: doc.cleanTitle,
          size: doc.size,
        },
      ]);
    }
  };

  // Drag and drop reordering
  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', index.toString());
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const dragIndexStr = e.dataTransfer.getData('text/plain');
    const dragIndex = parseInt(dragIndexStr, 10);
    if (isNaN(dragIndex) || dragIndex === dropIndex) return;

    const newQueue = [...queue];
    const [moved] = newQueue.splice(dragIndex, 1);
    newQueue.splice(dropIndex, 0, moved);
    setQueue(newQueue);
  };

  // Merge execution
  const handleMerge = async () => {
    if (queue.length < 2) return;

    setIsProcessing(true);
    setErrorMessage(null);
    setMergeResult(null);

    try {
      // 1. Download blobs sequentially for memory safety
      const sources: MergeSourceItem[] = [];

      for (let i = 0; i < queue.length; i++) {
        const item = queue[i];
        setProcessingStage(`Fetching "${item.cleanTitle || item.name}" from Google Drive...`);
        setProcessingPercent(Math.round(((i + 1) / queue.length) * 40));

        let blob = item.blob;
        if (!blob) {
          if (!navigator.onLine) {
            throw new Error(
              `You are offline. "${item.cleanTitle || item.name}" is not loaded in memory and cannot be downloaded from Google Drive until reconnected.`
            );
          }
          const res = await driveFetch(
            `https://www.googleapis.com/drive/v3/files/${item.id}?alt=media`
          );
          if (!res.ok) {
            throw new Error(`Failed to load "${item.name}" from Google Drive (HTTP ${res.status})`);
          }
          blob = await res.blob();
        }

        sources.push({
          id: item.id,
          name: item.name,
          blob,
        });
      }

      // 2. Perform merge using pdf-lib
      const result = await mergePdfs(sources, (stage, pct) => {
        setProcessingStage(stage);
        if (pct) setProcessingPercent(pct);
      });

      // 3. Create blob URL for download
      const url = URL.createObjectURL(result.blob);
      setResultBlobUrl(url);
      setMergeResult(result);
    } catch (err: any) {
      console.error('Merge failed:', err);
      setErrorMessage(err.message || 'PDF merge encountered an error.');
    } finally {
      setIsProcessing(false);
    }
  };

  const outputFilename = generateMergedFilename(queue[0]?.name);

  const handleDownload = () => {
    if (!resultBlobUrl) return;
    const a = document.createElement('a');
    a.href = resultBlobUrl;
    a.download = outputFilename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleShare = async () => {
    if (!mergeResult || !canShare) return;
    try {
      const file = new File([mergeResult.blob], outputFilename, {
        type: 'application/pdf',
      });
      await navigator.share({
        files: [file],
        title: outputFilename,
      });
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Sharing failed:', err);
      }
    }
  };

  const filteredPickerDocs = pdfDocs.filter((d) => {
    if (!pickerSearchQuery.trim()) return true;
    const q = pickerSearchQuery.toLowerCase();
    return (
      d.name.toLowerCase().includes(q) ||
      d.cleanTitle.toLowerCase().includes(q) ||
      d.folderPath?.toLowerCase().includes(q)
    );
  });

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-merge-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))]"
    >
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden text-neutral-100">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-950/60 border border-purple-800/80 text-purple-300 flex items-center justify-center shrink-0">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 id="pdf-merge-title" className="font-semibold text-base sm:text-lg text-white leading-tight">
                Merge PDFs
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5">
                Combine multiple PDFs into a single document &bull; 100% Client-side
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 cursor-pointer transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Result View */}
          {mergeResult ? (
            <div className="space-y-5 animate-in fade-in zoom-in-95 duration-200">
              <div className="p-4 bg-emerald-950/40 border border-emerald-800/60 rounded-xl flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="font-semibold text-sm text-emerald-200">
                    PDFs Merged Successfully!
                  </h3>
                  <p className="text-xs text-emerald-300/80">
                    Combined {queue.length} documents into a single verified PDF.
                  </p>
                </div>
              </div>

              {/* Output Stats Card */}
              <div className="bg-neutral-950/80 border border-neutral-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between text-xs pb-3 border-b border-neutral-800/70">
                  <span className="text-neutral-400">Output File</span>
                  <span className="font-mono text-neutral-200 font-medium">{outputFilename}</span>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-neutral-900/90 p-2.5 rounded-lg border border-neutral-800">
                    <span className="text-[11px] text-neutral-400 block">Total Pages</span>
                    <span className="font-semibold text-base text-white font-mono">
                      {mergeResult.pageCount}
                    </span>
                  </div>
                  <div className="bg-neutral-900/90 p-2.5 rounded-lg border border-neutral-800">
                    <span className="text-[11px] text-neutral-400 block">Output Size</span>
                    <span className="font-semibold text-base text-white font-mono">
                      {formatFileSize(mergeResult.outputBytes)}
                    </span>
                  </div>
                  <div className="bg-neutral-900/90 p-2.5 rounded-lg border border-neutral-800">
                    <span className="text-[11px] text-neutral-400 block">Duration</span>
                    <span className="font-semibold text-base text-white font-mono">
                      {mergeResult.durationMs}ms
                    </span>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleDownload}
                  className="flex-1 min-h-[46px] px-5 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-900/30 transition-all"
                >
                  <Download className="w-4 h-4" />
                  Download Merged PDF
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
                    setMergeResult(null);
                    setResultBlobUrl(null);
                  }}
                  className="min-h-[46px] px-4 py-2.5 border border-neutral-800 hover:bg-neutral-800 active:bg-neutral-900 text-neutral-300 rounded-xl font-medium text-sm flex items-center justify-center cursor-pointer transition-colors"
                >
                  Modify Queue
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Queue Header & Actions */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    Selected PDFs ({queue.length})
                  </span>
                  {queue.length > 0 && (
                    <span className="text-xs text-neutral-500 font-mono">
                      &bull; {formatFileSize(queue.reduce((acc, i) => acc + i.size, 0))} total
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsAddPickerOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs font-medium cursor-pointer shadow transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add PDFs
                  </button>
                  {queue.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAll}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-red-400 text-xs font-medium cursor-pointer transition-colors"
                      title="Clear list"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Clear All
                    </button>
                  )}
                </div>
              </div>

              {/* Instructions banner */}
              <div className="text-xs text-neutral-400 bg-neutral-950/60 border border-neutral-800/80 rounded-xl p-3 flex items-center gap-2">
                <GripVertical className="w-4 h-4 text-neutral-500 shrink-0" />
                <span>
                  The order shown below determines the final merged PDF page order. Drag or use the <strong>↑ / ↓</strong> buttons to reorder.
                </span>
              </div>

              {/* Queued PDF Items List */}
              {queue.length === 0 ? (
                <div className="text-center py-10 px-4 border border-dashed border-neutral-800 rounded-xl space-y-3">
                  <div className="w-12 h-12 rounded-xl bg-neutral-850 text-neutral-500 flex items-center justify-center mx-auto">
                    <Layers className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-neutral-300">No PDFs selected for merging</p>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Click &ldquo;Add PDFs&rdquo; above to select documents from your indexed library.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddPickerOpen(true)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium cursor-pointer transition-colors shadow"
                  >
                    <Plus className="w-4 h-4" />
                    Select PDF Files
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {queue.map((item, index) => (
                    <div
                      key={item.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, index)}
                      onDragOver={handleDragOver}
                      onDrop={(e) => handleDrop(e, index)}
                      className="group bg-neutral-950/70 hover:bg-neutral-850 border border-neutral-800 hover:border-neutral-700 rounded-xl p-3 flex items-center justify-between gap-3 transition-all"
                    >
                      {/* Left: Drag Handle, Number, Icon & Title */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div
                          className="cursor-grab active:cursor-grabbing text-neutral-600 group-hover:text-neutral-400 p-1 -ml-1 rounded"
                          title="Drag to reorder"
                        >
                          <GripVertical className="w-4 h-4" />
                        </div>
                        <span className="w-5 h-5 rounded-full bg-neutral-800 text-neutral-300 font-mono text-[11px] font-semibold flex items-center justify-center shrink-0">
                          {index + 1}
                        </span>
                        <div className="w-7 h-7 rounded-lg bg-red-950/60 border border-red-800/60 text-red-400 flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs sm:text-sm font-medium text-white truncate leading-tight">
                            {item.cleanTitle || item.name}
                          </p>
                          <p className="text-[11px] text-neutral-400 font-mono truncate">
                            {item.name} &bull; {formatFileSize(item.size)}
                          </p>
                        </div>
                      </div>

                      {/* Right: Reorder & Remove Controls */}
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleMoveUp(index)}
                          disabled={index === 0}
                          aria-label={`Move ${item.cleanTitle || item.name} up in merge order`}
                          className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-neutral-800 active:bg-neutral-700 text-neutral-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
                          title="Move up"
                        >
                          <ArrowUp className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveDown(index)}
                          disabled={index === queue.length - 1}
                          aria-label={`Move ${item.cleanTitle || item.name} down in merge order`}
                          className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-neutral-800 active:bg-neutral-700 text-neutral-400 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
                          title="Move down"
                        >
                          <ArrowDown className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(index)}
                          aria-label={`Remove ${item.cleanTitle || item.name} from merge list`}
                          className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg hover:bg-red-950/60 text-neutral-500 hover:text-red-400 active:bg-red-950 cursor-pointer transition-colors ml-1"
                          title="Remove from merge list"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Error banner */}
              {errorMessage && (
                <div className="p-3 bg-red-950/60 border border-red-800/80 rounded-xl flex items-center gap-2 text-xs text-red-200">
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  <span>{errorMessage}</span>
                </div>
              )}

              {/* Processing Progress */}
              {isProcessing && (
                <div className="space-y-2 p-3.5 bg-neutral-950 border border-purple-900/50 rounded-xl animate-in fade-in duration-150">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-purple-300 font-medium flex items-center gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-purple-400" />
                      {processingStage || 'Merging documents...'}
                    </span>
                    <span className="text-neutral-400 font-mono">{processingPercent}%</span>
                  </div>
                  <div className="w-full bg-neutral-900 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-purple-500 h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${processingPercent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Merge Button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={handleMerge}
                  disabled={queue.length < 2 || isProcessing}
                  className="w-full min-h-[48px] px-6 py-3 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2.5 cursor-pointer shadow-lg shadow-purple-950/40 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Layers className="w-4 h-4" />
                  {isProcessing
                    ? 'Merging Documents...'
                    : queue.length < 2
                    ? 'Select at least 2 PDFs to Merge'
                    : `Merge ${queue.length} PDFs`}
                </button>
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3 sm:p-4 bg-neutral-950/90 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-500 shrink-0">
          <span>Google Drive source of truth &bull; Never overwrites originals</span>
          <button
            type="button"
            onClick={onClose}
            className="hover:text-neutral-300 cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>

      {/* PDF Picker Overlay / Drawer */}
      {isAddPickerOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between gap-3">
              <h3 className="font-semibold text-sm sm:text-base text-white">
                Add PDFs to Merge
              </h3>
              <button
                type="button"
                onClick={() => setIsAddPickerOpen(false)}
                className="text-neutral-400 hover:text-white rounded p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input */}
            <div className="p-3 border-b border-neutral-800">
              <div className="relative">
                <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={pickerSearchQuery}
                  onChange={(e) => setPickerSearchQuery(e.target.value)}
                  placeholder="Filter available PDF documents..."
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl pl-9 pr-3 py-2 text-xs text-white placeholder-neutral-500 outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Documents List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {filteredPickerDocs.length === 0 ? (
                <div className="text-center py-8 text-xs text-neutral-500">
                  No matching PDF documents found in library.
                </div>
              ) : (
                filteredPickerDocs.map((doc) => {
                  const isSelected = queue.some((q) => q.id === doc.id);
                  return (
                    <div
                      key={doc.id}
                      onClick={() => handleToggleAddDoc(doc)}
                      className={`p-2.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-purple-950/40 border-purple-800/80 text-purple-200'
                          : 'bg-neutral-950/60 hover:bg-neutral-850 border-neutral-800 text-neutral-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div
                          className={`w-5 h-5 rounded flex items-center justify-center border shrink-0 ${
                            isSelected
                              ? 'bg-purple-600 border-purple-500 text-white'
                              : 'border-neutral-700 bg-neutral-900'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{doc.cleanTitle}</p>
                          <p className="text-[10px] text-neutral-500 font-mono truncate">
                            {doc.name} &bull; {formatFileSize(doc.size)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Picker Footer */}
            <div className="p-3 border-t border-neutral-800 flex items-center justify-between bg-neutral-950/80">
              <span className="text-xs text-neutral-400">
                {queue.length} document{queue.length === 1 ? '' : 's'} queued
              </span>
              <button
                type="button"
                onClick={() => setIsAddPickerOpen(false)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium cursor-pointer shadow"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
