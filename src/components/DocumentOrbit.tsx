import React from 'react';
import {
  Sparkles,
  Layers,
  Scissors,
  FolderOpen,
  FileCheck,
} from 'lucide-react';
import { PrepareDropTarget } from './PrepareDropTarget';
import type { DocItem } from '../types';

interface DocumentOrbitProps {
  onPrepareClick: () => void;
  onCompressClick: () => void;
  onMergeClick: (doc?: DocItem, blob?: Blob) => void;
  onEditPagesClick: (doc?: DocItem, blob?: Blob) => void;
  onBrowseClick: () => void;
  onPrepareDoc?: (doc: DocItem, blob?: Blob) => void;
  allDocs?: DocItem[];
  isWindowDragging?: boolean;
}

export const DocumentOrbit: React.FC<DocumentOrbitProps> = ({
  onPrepareClick,
  onCompressClick,
  onMergeClick,
  onEditPagesClick,
  onBrowseClick,
  onPrepareDoc,
  allDocs = [],
  isWindowDragging = false,
}) => {
  const satelliteRecedeClass = isWindowDragging
    ? 'opacity-35 scale-95 blur-[0.4px] pointer-events-none transition-all duration-300'
    : 'opacity-100 scale-100 transition-all duration-300';

  return (
    <div className="relative w-full max-w-sm sm:max-w-md mx-auto aspect-square max-h-[300px] sm:max-h-[330px] flex items-center justify-center select-none my-1 sm:my-3">
      {/* Ambient background rings */}
      <div
        className={`absolute w-[260px] h-[260px] sm:w-[290px] sm:h-[290px] rounded-full border border-dashed transition-all duration-500 pointer-events-none ${
          isWindowDragging
            ? 'border-orange-300/80 scale-105'
            : 'border-orange-200/60'
        }`}
      />
      <div
        className={`absolute w-[180px] h-[180px] sm:w-[200px] sm:h-[200px] rounded-full border transition-all duration-500 pointer-events-none ${
          isWindowDragging
            ? 'border-orange-200 scale-105'
            : 'border-orange-100/80'
        }`}
      />
      <div
        className={`absolute w-36 h-36 rounded-full bg-gradient-to-tr from-orange-400/15 via-amber-300/15 to-transparent blur-xl transition-all duration-500 pointer-events-none ${
          isWindowDragging ? 'scale-125 opacity-70' : 'opacity-40'
        }`}
      />

      {/* Central Primary Action & Drop Target */}
      <PrepareDropTarget
        onPrepareDoc={(doc, blob) => {
          if (onPrepareDoc) {
            onPrepareDoc(doc, blob);
          } else {
            onPrepareClick();
          }
        }}
        onOpenMerge={(doc, blob) => onMergeClick(doc, blob)}
        onOpenManagePages={(doc, blob) => onEditPagesClick(doc, blob)}
        onOpenQuickAction={onPrepareClick}
        allDocs={allDocs}
        isWindowDragging={isWindowDragging}
      />

      {/* Orbital Satellite 1: Top -> Compress */}
      <div className={`absolute top-1 sm:top-2 inset-x-0 mx-auto w-fit z-10 ${satelliteRecedeClass}`}>
        <button
          type="button"
          onClick={onCompressClick}
          aria-label="Compress documents to target size"
          className="bg-emerald-50 hover:bg-emerald-100/90 active:bg-emerald-200/90 border border-emerald-200/70 text-emerald-900 rounded-2xl px-3 py-1.5 sm:py-2 flex items-center gap-2 shadow-xs transition-all active:scale-95 cursor-pointer"
        >
          <div className="w-6 h-6 rounded-lg bg-emerald-500 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <div className="text-left">
            <p className="text-xs font-bold leading-tight">Compress</p>
            <p className="text-[9px] text-emerald-600 font-medium leading-none">Target size</p>
          </div>
        </button>
      </div>

      {/* Orbital Satellite 2: Right -> Merge */}
      <div className={`absolute right-0 sm:right-2 top-1/2 -translate-y-1/2 w-fit z-10 ${satelliteRecedeClass}`}>
        <button
          type="button"
          onClick={() => onMergeClick()}
          aria-label="Merge multiple PDF files"
          className="bg-rose-50 hover:bg-rose-100/90 active:bg-rose-200/90 border border-rose-200/70 text-rose-900 rounded-2xl px-2.5 sm:px-3 py-1.5 sm:py-2 flex items-center gap-2 shadow-xs transition-all active:scale-95 cursor-pointer"
        >
          <div className="w-6 h-6 rounded-lg bg-rose-500 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Layers className="w-3.5 h-3.5" />
          </div>
          <div className="text-left">
            <p className="text-xs font-bold leading-tight">Merge</p>
            <p className="text-[9px] text-rose-600 font-medium leading-none hidden sm:block">Combine PDFs</p>
          </div>
        </button>
      </div>

      {/* Orbital Satellite 3: Left -> Browse / Open */}
      <div className={`absolute left-0 sm:left-2 top-1/2 -translate-y-1/2 w-fit z-10 ${satelliteRecedeClass}`}>
        <button
          type="button"
          onClick={onBrowseClick}
          aria-label="Browse all documents in library"
          className="bg-amber-50 hover:bg-amber-100/90 active:bg-amber-200/90 border border-amber-200/70 text-amber-900 rounded-2xl px-2.5 sm:px-3 py-1.5 sm:py-2 flex items-center gap-2 shadow-xs transition-all active:scale-95 cursor-pointer"
        >
          <div className="w-6 h-6 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-xs">
            <FolderOpen className="w-3.5 h-3.5" />
          </div>
          <div className="text-left">
            <p className="text-xs font-bold leading-tight">Browse</p>
            <p className="text-[9px] text-amber-600 font-medium leading-none hidden sm:block">All files</p>
          </div>
        </button>
      </div>

      {/* Orbital Satellite 4: Bottom-Left -> Edit Pages */}
      <div className={`absolute bottom-1 sm:bottom-2 left-2 sm:left-6 w-fit z-10 ${satelliteRecedeClass}`}>
        <button
          type="button"
          onClick={() => onEditPagesClick()}
          aria-label="Manage PDF pages"
          className="bg-sky-50 hover:bg-sky-100/90 active:bg-sky-200/90 border border-sky-200/70 text-sky-900 rounded-2xl px-2.5 sm:px-3 py-1.5 sm:py-2 flex items-center gap-2 shadow-xs transition-all active:scale-95 cursor-pointer"
        >
          <div className="w-6 h-6 rounded-lg bg-sky-500 text-white flex items-center justify-center shrink-0 shadow-xs">
            <Scissors className="w-3.5 h-3.5" />
          </div>
          <div className="text-left">
            <p className="text-xs font-bold leading-tight">Edit</p>
            <p className="text-[9px] text-sky-600 font-medium leading-none">PDF pages</p>
          </div>
        </button>
      </div>

      {/* Orbital Satellite 5: Bottom-Right -> Convert / Upload Ready */}
      <div className={`absolute bottom-1 sm:bottom-2 right-2 sm:right-6 w-fit z-10 ${satelliteRecedeClass}`}>
        <button
          type="button"
          onClick={onPrepareClick}
          aria-label="Convert and prepare upload"
          className="bg-purple-50 hover:bg-purple-100/90 active:bg-purple-200/90 border border-purple-200/70 text-purple-900 rounded-2xl px-2.5 sm:px-3 py-1.5 sm:py-2 flex items-center gap-2 shadow-xs transition-all active:scale-95 cursor-pointer"
        >
          <div className="w-6 h-6 rounded-lg bg-purple-500 text-white flex items-center justify-center shrink-0 shadow-xs">
            <FileCheck className="w-3.5 h-3.5" />
          </div>
          <div className="text-left">
            <p className="text-xs font-bold leading-tight">Convert</p>
            <p className="text-[9px] text-purple-600 font-medium leading-none">Upload ready</p>
          </div>
        </button>
      </div>
    </div>
  );
};
