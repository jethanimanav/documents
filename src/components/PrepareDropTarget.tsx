import React, { useRef, useState, useEffect } from 'react';
import {
  FileText,
  Image as ImageIcon,
  FileUp,
  Sparkles,
  Scissors,
  Layers,
  X,
  AlertCircle,
} from 'lucide-react';
import type { DocItem } from '../types';
import {
  validateDroppedFiles,
  createLocalDocItem,
  getFileBadgeLabel,
  formatByteSize,
} from '../utils/dropValidation';
import { formatFileSize } from '../utils/folder';

export interface PrepareDropTargetProps {
  onPrepareDoc: (doc: DocItem, blob?: Blob) => void;
  onOpenMerge?: (doc?: DocItem, blob?: Blob) => void;
  onOpenManagePages?: (doc?: DocItem, blob?: Blob) => void;
  onOpenQuickAction?: () => void;
  allDocs: DocItem[];
  isWindowDragging?: boolean;
}

interface LandedDocumentState {
  doc: DocItem;
  blob?: Blob;
  badgeLabel: string;
  sizeFormatted: string;
}

export const PrepareDropTarget: React.FC<PrepareDropTargetProps> = ({
  onPrepareDoc,
  onOpenMerge,
  onOpenManagePages,
  onOpenQuickAction,
  allDocs,
  isWindowDragging = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isOverTarget, setIsOverTarget] = useState(false);
  const [isLanding, setIsLanding] = useState(false);
  const [landedDoc, setLandedDoc] = useState<LandedDocumentState | null>(null);
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile viewport or touch-first device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(
        window.innerWidth < 640 ||
        (typeof window !== 'undefined' && 'ontouchstart' in window && window.innerWidth < 768)
      );
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Clear notice after 3.5s
  useEffect(() => {
    if (!noticeMessage) return;
    const t = setTimeout(() => setNoticeMessage(null), 3500);
    return () => clearTimeout(t);
  }, [noticeMessage]);

  const triggerLandingTransition = (item: LandedDocumentState) => {
    setIsLanding(true);
    setLandedDoc(item);
    // Smooth 350ms landing animation
    setTimeout(() => {
      setIsLanding(false);
    }, 350);
  };

  // Drag over target specifically
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOverTarget(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    if (!isOverTarget) setIsOverTarget(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only reset if exiting the target boundaries
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsOverTarget(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOverTarget(false);

    // 1. Internal doc card drag from library
    const internalDocId = e.dataTransfer.getData('application/x-personal-doc-id');
    if (internalDocId) {
      const found = allDocs.find((d) => d.id === internalDocId);
      if (found) {
        triggerLandingTransition({
          doc: found,
          badgeLabel: getFileBadgeLabel(found),
          sizeFormatted: formatFileSize(found.size),
        });
        return;
      }
    }

    // 2. External OS file drop
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const validation = validateDroppedFiles(files);
    if (validation.error || !validation.primaryFile) {
      setNoticeMessage(validation.error || 'Unsupported file');
      return;
    }

    if (validation.multipleNotice) {
      setNoticeMessage(validation.multipleNotice);
    }

    const primaryFile = validation.primaryFile;
    const localDoc = createLocalDocItem(primaryFile);

    triggerLandingTransition({
      doc: localDoc,
      blob: primaryFile,
      badgeLabel: getFileBadgeLabel(primaryFile),
      sizeFormatted: formatByteSize(primaryFile.size),
    });
  };

  // Handle local file selection from file input
  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const validation = validateDroppedFiles(files);
    if (validation.error || !validation.primaryFile) {
      setNoticeMessage(validation.error || 'Unsupported file');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (validation.multipleNotice) {
      setNoticeMessage(validation.multipleNotice);
    }

    const primaryFile = validation.primaryFile;
    const localDoc = createLocalDocItem(primaryFile);

    triggerLandingTransition({
      doc: localDoc,
      blob: primaryFile,
      badgeLabel: getFileBadgeLabel(primaryFile),
      sizeFormatted: formatByteSize(primaryFile.size),
    });

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Primary action button trigger
  const handlePrimaryAction = () => {
    if (!landedDoc) return;
    onPrepareDoc(landedDoc.doc, landedDoc.blob);
  };

  const isPdf =
    landedDoc?.doc.mimeType === 'application/pdf' ||
    /\.pdf$/i.test(landedDoc?.doc.name || '');

  // Render Landed State:
  // Shows [filename], PDF · 2.4 MB with appropriate existing actions
  if (landedDoc) {
    return (
      <div
        className={`relative z-30 w-[270px] sm:w-[310px] bg-white border-2 border-orange-400/90 shadow-2xl shadow-orange-500/20 rounded-3xl p-4 sm:p-5 flex flex-col gap-3 transition-all ${
          isLanding ? 'animate-doc-landing' : ''
        }`}
      >
        {/* Top Header: File Badge, Filename, Size, and Clear Button */}
        <div className="flex items-start justify-between gap-2.5">
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            <div
              className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 border ${
                isPdf
                  ? 'bg-rose-50 border-rose-200 text-rose-500'
                  : 'bg-sky-50 border-sky-200 text-sky-500'
              }`}
            >
              {isPdf ? (
                <FileText className="w-5 h-5 stroke-[2.2]" />
              ) : (
                <ImageIcon className="w-5 h-5 stroke-[2.2]" />
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h3
                className="font-bold text-sm text-neutral-900 truncate leading-snug"
                title={landedDoc.doc.name}
              >
                {landedDoc.doc.cleanTitle || landedDoc.doc.name}
              </h3>
              <p className="text-xs text-neutral-500 font-semibold mt-0.5">
                {landedDoc.badgeLabel} &bull; {landedDoc.sizeFormatted}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setLandedDoc(null)}
            className="text-neutral-400 hover:text-neutral-700 min-w-[32px] min-h-[32px] flex items-center justify-center rounded-xl hover:bg-neutral-100 transition-colors cursor-pointer"
            title="Clear and choose another document"
            aria-label="Clear document"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action Buttons: Compress, and if PDF: Pages, Merge */}
        <div className="flex items-center gap-2 pt-1 border-t border-neutral-100">
          <button
            type="button"
            onClick={handlePrimaryAction}
            aria-label={`Prepare and compress ${landedDoc.doc.name}`}
            className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white font-bold text-xs sm:text-sm py-2 px-3 rounded-xl shadow-md shadow-orange-500/20 active:scale-95 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 stroke-[2.4]" />
            <span>Compress</span>
          </button>

          {isPdf && onOpenManagePages && (
            <button
              type="button"
              onClick={() => onOpenManagePages(landedDoc.doc, landedDoc.blob)}
              aria-label="Manage PDF pages"
              className="bg-sky-50 hover:bg-sky-100 text-sky-800 border border-sky-200/80 font-bold text-xs py-2 px-2.5 rounded-xl active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer"
              title="Edit pages"
            >
              <Scissors className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Pages</span>
            </button>
          )}

          {isPdf && onOpenMerge && (
            <button
              type="button"
              onClick={() => onOpenMerge(landedDoc.doc, landedDoc.blob)}
              aria-label="Merge with other PDFs"
              className="bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200/80 font-bold text-xs py-2 px-2.5 rounded-xl active:scale-95 transition-all flex items-center justify-center gap-1 cursor-pointer"
              title="Merge PDF"
            >
              <Layers className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Merge</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  // Render Default or Drag-Over State:
  return (
    <div className="relative flex flex-col items-center justify-center">
      {/* Hidden file input for desktop clicking or mobile selection */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,image/jpeg,image/png,image/webp"
        onChange={handleFileInputChange}
        className="hidden"
        aria-hidden="true"
      />

      {/* Pulsing ring ripple during drag-over */}
      {isOverTarget && (
        <div className="absolute -inset-3 sm:-inset-4 rounded-full border-2 border-orange-400/80 animate-ring-ripple pointer-events-none" />
      )}

      {/* Main Prepare circular target */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          if (isMobile && onOpenQuickAction) {
            onOpenQuickAction();
          } else {
            fileInputRef.current?.click();
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            fileInputRef.current?.click();
          }
        }}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        aria-label={
          isOverTarget
            ? 'Drop document here to prepare'
            : isMobile
            ? 'Choose a document to prepare'
            : 'Drop a document here or click to browse'
        }
        className={`w-28 h-28 sm:w-32 sm:h-32 rounded-full text-white flex flex-col items-center justify-center text-center px-2 select-none cursor-pointer transition-all duration-300 z-20 ${
          isOverTarget
            ? 'scale-110 bg-gradient-to-tr from-orange-600 via-amber-600 to-orange-500 shadow-2xl shadow-orange-600/40 ring-8 ring-orange-400/50'
            : isWindowDragging
            ? 'scale-105 bg-gradient-to-tr from-orange-500 via-amber-500 to-orange-400 shadow-xl shadow-orange-500/30 ring-6 ring-orange-400/30 animate-pulse'
            : 'bg-gradient-to-tr from-orange-500 via-amber-500 to-orange-400 shadow-xl shadow-orange-500/25 ring-6 sm:ring-8 ring-orange-500/10 hover:scale-105 active:scale-95'
        }`}
      >
        {/* Animated Icon */}
        <div
          className={`w-8 h-8 rounded-full bg-white/20 flex items-center justify-center transition-transform ${
            isOverTarget ? 'animate-icon-float scale-110' : ''
          }`}
        >
          <FileUp className="w-5 h-5 stroke-[2.4]" />
        </div>

        {/* Title */}
        <span className="font-extrabold text-sm sm:text-base tracking-tight mt-1 leading-none drop-shadow-xs">
          Prepare
        </span>

        {/* Subtitle changes dynamically */}
        <span className="text-[10px] sm:text-[11px] text-white/95 font-semibold mt-1 leading-tight px-1">
          {isOverTarget
            ? 'Drop it here'
            : isMobile
            ? 'Choose a document'
            : 'Drop a document here'}
        </span>
      </div>

      {/* Notification toast for unsupported format or multiple files */}
      {noticeMessage && (
        <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 w-max max-w-[280px] sm:max-w-xs bg-stone-900/95 text-white text-[11px] font-medium py-1.5 px-3 rounded-full shadow-lg flex items-center gap-1.5 z-40 animate-fade-in text-center">
          <AlertCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="truncate">{noticeMessage}</span>
        </div>
      )}
    </div>
  );
};
