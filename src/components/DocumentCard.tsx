import React, { useState } from 'react';
import {
  FileText,
  Image,
  Folder,
  Pin,
  Tag,
  Check,
  ChevronDown,
} from 'lucide-react';
import type { DocItem, DocCategory } from '../types';
import { formatFileSize, getFileExtension } from '../utils/folder';
import { ALL_CATEGORIES } from '../utils/category';

interface DocumentCardProps {
  doc: DocItem;
  isPinned: boolean;
  onTogglePin: (id: string) => void;
  onSelect?: (doc: DocItem) => void;
  onUpdateCategory: (id: string, category: DocCategory) => void;
}

export const DocumentCard: React.FC<DocumentCardProps> = ({
  doc,
  isPinned,
  onTogglePin,
  onSelect,
  onUpdateCategory,
}) => {
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const ext = getFileExtension(doc.name);
  const isPdf = ext === 'PDF';

  const categoryColors: Record<DocCategory, { bg: string; text: string; border: string }> = {
    Identity: { bg: 'bg-emerald-950/70', text: 'text-emerald-300', border: 'border-emerald-800/80' },
    Education: { bg: 'bg-sky-950/70', text: 'text-sky-300', border: 'border-sky-800/80' },
    Financial: { bg: 'bg-amber-950/70', text: 'text-amber-300', border: 'border-amber-800/80' },
    Insurance: { bg: 'bg-purple-950/70', text: 'text-purple-300', border: 'border-purple-800/80' },
    Government: { bg: 'bg-rose-950/70', text: 'text-rose-300', border: 'border-rose-800/80' },
    Medical: { bg: 'bg-teal-950/70', text: 'text-teal-300', border: 'border-teal-800/80' },
    Other: { bg: 'bg-neutral-800/70', text: 'text-neutral-300', border: 'border-neutral-700/80' },
  };

  const catStyle = categoryColors[doc.category] || categoryColors.Other;

  return (
    <div
      onClick={() => onSelect?.(doc)}
      className="group relative bg-neutral-900/90 hover:bg-neutral-850 border border-neutral-800 hover:border-neutral-700 rounded-xl p-3.5 sm:p-4 transition-all shadow-sm hover:shadow-md flex flex-col justify-between gap-3"
    >
      <div className="flex items-start justify-between gap-2.5">
        {/* File Type Icon & Title */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              isPdf
                ? 'bg-red-950/50 border-red-800/60 text-red-400'
                : 'bg-blue-950/50 border-blue-800/60 text-blue-400'
            }`}
          >
            {isPdf ? <FileText className="w-5 h-5" /> : <Image className="w-5 h-5" />}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm sm:text-base text-neutral-100 truncate leading-snug">
              {doc.cleanTitle}
            </h3>
            <p className="text-xs text-neutral-400 truncate font-mono mt-0.5">
              {doc.name}
            </p>
          </div>
        </div>

        {/* Pin Button (min 44px tap target) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin(doc.id);
          }}
          className={`min-w-[44px] min-h-[44px] -mr-1 -mt-1 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
            isPinned
              ? 'text-amber-400 hover:text-amber-300'
              : 'text-neutral-500 hover:text-neutral-300'
          }`}
          title={isPinned ? 'Unpin' : 'Pin to top'}
        >
          <Pin className={`w-4 h-4 ${isPinned ? 'fill-amber-400' : ''}`} />
        </button>
      </div>

      {/* Metadata Badges: Size, Type, Folder Path */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {/* Type & Size pill */}
        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-neutral-950 border border-neutral-800 font-mono text-[11px] text-neutral-300">
          <strong className="mr-1 text-neutral-100">{ext}</strong> &bull; {formatFileSize(doc.size)}
        </span>

        {/* Category Pill with Quick Override Dropdown */}
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowCategoryMenu((v) => !v);
            }}
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium border cursor-pointer ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}
            title="Click to override category"
          >
            <Tag className="w-3 h-3" />
            <span>{doc.category}</span>
            <ChevronDown className="w-2.5 h-2.5 opacity-70" />
          </button>

          {showCategoryMenu && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute left-0 top-full mt-1 z-30 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl p-1 w-36 text-xs animate-in fade-in duration-150"
            >
              <div className="px-2 py-1 text-[10px] uppercase font-semibold text-neutral-400 border-b border-neutral-800">
                Set Category
              </div>
              {ALL_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    onUpdateCategory(doc.id, cat);
                    setShowCategoryMenu(false);
                  }}
                  className={`w-full text-left px-2 py-1.5 rounded flex items-center justify-between hover:bg-neutral-800 cursor-pointer text-xs ${
                    doc.category === cat ? 'font-semibold text-blue-400' : 'text-neutral-300'
                  }`}
                >
                  <span>{cat}</span>
                  {doc.category === cat && <Check className="w-3 h-3 text-blue-400" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Folder Path */}
        {doc.folderPath && (
          <span className="inline-flex items-center gap-1 text-[11px] text-neutral-400 truncate max-w-[200px] sm:max-w-[280px]">
            <Folder className="w-3 h-3 shrink-0 text-neutral-500" />
            <span className="truncate" title={doc.folderPath}>{doc.folderPath}</span>
          </span>
        )}
      </div>
    </div>
  );
};
