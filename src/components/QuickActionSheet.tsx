import React, { useEffect } from 'react';
import {
  X,
  Sparkles,
  Layers,
  Scissors,
  FileText,
  Image,
  ChevronRight,
  ArrowRight,
} from 'lucide-react';
import type { DocItem } from '../types';
import { formatFileSize, getFileExtension } from '../utils/folder';

interface QuickActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  recentDocs: DocItem[];
  onSelectDoc: (doc: DocItem) => void;
  onOpenMerge: () => void;
  onOpenManagePages?: () => void;
  onOpenImagesToPdf?: () => void;
  onBrowseFiles: () => void;
}

export const QuickActionSheet: React.FC<QuickActionSheetProps> = ({
  isOpen,
  onClose,
  recentDocs,
  onSelectDoc,
  onOpenMerge,
  onOpenImagesToPdf,
  onBrowseFiles,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="prepare-sheet-title"
      className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-neutral-200/80 rounded-t-3xl sm:rounded-3xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl overflow-hidden text-neutral-900 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 pb-[max(1rem,env(safe-area-inset-bottom,0px))]"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-orange-500 to-amber-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 id="prepare-sheet-title" className="font-bold text-base text-neutral-900 leading-tight">
                Prepare Document
              </h2>
              <p className="text-xs text-neutral-500 mt-0.5">
                Optimize upload sizes and manage your files
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center text-neutral-400 hover:text-neutral-700 rounded-full hover:bg-neutral-100 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action Options */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 flex-1">
          <div className="space-y-2.5">
            {/* Action 1: Compress Size */}
            <button
              type="button"
              onClick={() => {
                onClose();
                if (recentDocs.length > 0) {
                  onSelectDoc(recentDocs[0]);
                } else {
                  onBrowseFiles();
                }
              }}
              className="w-full text-left p-3.5 rounded-2xl bg-emerald-50/70 hover:bg-emerald-100/70 border border-emerald-100/90 flex items-center justify-between gap-3 group transition-all active:scale-[0.99] cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm text-neutral-900 leading-tight">
                    Compress Upload Size
                  </p>
                  <p className="text-xs text-neutral-600 mt-0.5 leading-snug">
                    Fit portal limits (500 KB, 200 KB, custom) with client-only compression
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-emerald-600 group-hover:translate-x-0.5 transition-transform shrink-0" />
            </button>

            {/* Action 2: Merge PDFs */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenMerge();
              }}
              className="w-full text-left p-3.5 rounded-2xl bg-rose-50/70 hover:bg-rose-100/70 border border-rose-100/90 flex items-center justify-between gap-3 group transition-all active:scale-[0.99] cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Layers className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm text-neutral-900 leading-tight">
                    Merge Multiple PDFs
                  </p>
                  <p className="text-xs text-neutral-600 mt-0.5 leading-snug">
                    Select and combine PDF documents into a single upload-ready file
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-rose-600 group-hover:translate-x-0.5 transition-transform shrink-0" />
            </button>

            {/* Action 3: Manage Pages */}
            <button
              type="button"
              onClick={() => {
                onClose();
                const firstPdf = recentDocs.find(
                  (d) => d.mimeType === 'application/pdf' || /\.pdf$/i.test(d.name)
                );
                if (firstPdf) {
                  onSelectDoc(firstPdf);
                } else {
                  onBrowseFiles();
                }
              }}
              className="w-full text-left p-3.5 rounded-2xl bg-sky-50/70 hover:bg-sky-100/70 border border-sky-100/90 flex items-center justify-between gap-3 group transition-all active:scale-[0.99] cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-sky-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Scissors className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm text-neutral-900 leading-tight">
                    Organize & Edit PDF Pages
                  </p>
                  <p className="text-xs text-neutral-600 mt-0.5 leading-snug">
                    Rotate, reorder, delete, or extract specific pages
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-sky-600 group-hover:translate-x-0.5 transition-transform shrink-0" />
            </button>

            {/* Action 4: Convert Images to PDF (Milestone 4) */}
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenImagesToPdf?.();
              }}
              className="w-full text-left p-3.5 rounded-2xl bg-amber-50/70 hover:bg-amber-100/70 border border-amber-100/90 flex items-center justify-between gap-3 group transition-all active:scale-[0.99] cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Image className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm text-neutral-900 leading-tight">
                    Convert Images to PDF
                  </p>
                  <p className="text-xs text-neutral-600 mt-0.5 leading-snug">
                    Combine multiple photos into a single PDF with custom margins & fit
                  </p>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-amber-600 group-hover:translate-x-0.5 transition-transform shrink-0" />
            </button>
          </div>

          {/* Quick pick from recent documents */}
          {recentDocs.length > 0 && (
            <div className="pt-2 border-t border-neutral-100 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">
                  Recent files to prepare
                </p>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onBrowseFiles();
                  }}
                  className="text-xs font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1 cursor-pointer"
                >
                  <span>Browse all</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>

              <div className="space-y-1.5">
                {recentDocs.slice(0, 3).map((doc) => {
                  const ext = getFileExtension(doc.name);
                  const isPdf = ext === 'PDF';
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      onClick={() => {
                        onClose();
                        onSelectDoc(doc);
                      }}
                      className="w-full text-left p-2.5 rounded-xl hover:bg-neutral-50 border border-neutral-150 flex items-center justify-between gap-2.5 group transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold ${
                            isPdf ? 'bg-red-50 text-red-600' : 'bg-blue-50 text-blue-600'
                          }`}
                        >
                          {isPdf ? <FileText className="w-4 h-4" /> : <Image className="w-4 h-4" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-neutral-900 truncate">
                            {doc.cleanTitle}
                          </p>
                          <p className="text-[10px] text-neutral-400 font-medium">
                            {ext} · {formatFileSize(doc.size)}
                          </p>
                        </div>
                      </div>
                      <span className="text-[11px] font-semibold text-orange-600 shrink-0">Open</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
