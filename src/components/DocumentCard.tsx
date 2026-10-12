import React, { useState } from 'react';
import {
  FileText,
  Image,
  Folder,
  Pin,
  Tag,
  Check,
  ChevronDown,
  ChevronRight,
  Info,
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
  onOpenDetails?: (doc: DocItem) => void;
}

export const DocumentCard: React.FC<DocumentCardProps> = ({
  doc,
  isPinned,
  onTogglePin,
  onSelect,
  onUpdateCategory,
  onOpenDetails,
}) => {
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const ext = getFileExtension(doc.name);
  const isPdf = ext === 'PDF';

  const categoryColors: Record<DocCategory, { bg: string; text: string; border: string }> = {
    Identity: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200/80' },
    Education: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-200/80' },
    Financial: { bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200/80' },
    Insurance: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200/80' },
    Government: { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200/80' },
    Medical: { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200/80' },
    Other: { bg: 'bg-neutral-100', text: 'text-neutral-700', border: 'border-neutral-200/80' },
  };

  const catStyle = categoryColors[doc.category] || categoryColors.Other;

  const formatRelativeDate = (isoString?: string): string => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays === 0) return 'Today';
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const relativeDate = formatRelativeDate(doc.modifiedTime);
  const [isDragging, setIsDragging] = useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or Escape key
  React.useEffect(() => {
    if (!showCategoryMenu) return;

    const handlePointerDown = (e: MouseEvent | PointerEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowCategoryMenu(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShowCategoryMenu(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showCategoryMenu]);

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={!showCategoryMenu}
      onDragStart={(e) => {
        if (showCategoryMenu) {
          e.preventDefault();
          return;
        }
        e.dataTransfer.setData('application/x-personal-doc-id', doc.id);
        e.dataTransfer.setData('text/plain', doc.name);
        e.dataTransfer.effectAllowed = 'copy';
        setIsDragging(true);
      }}
      onDragEnd={() => setIsDragging(false)}
      onClick={() => {
        if (!showCategoryMenu) {
          onSelect?.(doc);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (!showCategoryMenu) {
            onSelect?.(doc);
          }
        }
      }}
      className={`group relative bg-white hover:bg-neutral-50/70 border border-neutral-200/70 hover:border-neutral-300 rounded-2xl p-3.5 sm:p-4 transition-all shadow-[0_2px_8px_rgba(0,0,0,0.03)] hover:shadow-[0_8px_20px_rgba(0,0,0,0.06)] flex flex-col justify-between gap-3 select-none ${
        showCategoryMenu ? 'z-40 ring-1 ring-orange-400/40 shadow-md' : 'z-10'
      } ${
        isDragging
          ? 'opacity-60 scale-102 shadow-2xl ring-2 ring-orange-400/80 -translate-y-2 rotate-1 cursor-grabbing z-30'
          : showCategoryMenu
          ? 'cursor-default'
          : 'cursor-pointer hover:-translate-y-0.5'
      }`}
    >
      <div className="flex items-start justify-between gap-2.5">
        {/* File Type Visual Icon & Title */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div
            className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 border ${
              isPdf
                ? 'bg-rose-50 border-rose-100/90 text-rose-500'
                : 'bg-sky-50 border-sky-100/90 text-sky-500'
            }`}
          >
            {isPdf ? <FileText className="w-5 h-5 stroke-[2.2]" /> : <Image className="w-5 h-5 stroke-[2.2]" />}
          </div>

          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-sm sm:text-base text-neutral-900 group-hover:text-orange-600 truncate leading-snug transition-colors">
              {doc.cleanTitle}
            </h3>
            <p className="text-xs text-neutral-500 font-medium truncate mt-0.5">
              {ext} &bull; {formatFileSize(doc.size)} {relativeDate ? `\u2022 ${relativeDate}` : ''}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-0.5 -mr-1 -mt-1">
          {onOpenDetails && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetails(doc);
              }}
              aria-label={`View details and expiry for ${doc.cleanTitle}`}
              className="min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center rounded-xl text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100 transition-colors cursor-pointer"
              title="Details & Reminders"
            >
              <Info className="w-4 h-4" />
            </button>
          )}

          {/* Pin Button */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin(doc.id);
            }}
            aria-label={isPinned ? `Unpin ${doc.cleanTitle}` : `Pin ${doc.cleanTitle} to top`}
            className={`min-w-[44px] min-h-[44px] sm:min-w-[36px] sm:min-h-[36px] flex items-center justify-center rounded-xl transition-colors cursor-pointer ${
              isPinned
                ? 'text-amber-500 hover:text-amber-600 bg-amber-50'
                : 'text-neutral-400 hover:text-neutral-700 hover:bg-neutral-100'
            }`}
            title={isPinned ? 'Unpin' : 'Pin to top'}
          >
            <Pin className={`w-4 h-4 ${isPinned ? 'fill-amber-400 text-amber-500' : ''}`} />
          </button>
        </div>
      </div>

      {/* Footer Badges: Category Pill & Folder Path */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1 border-t border-neutral-100">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {/* Category Pill with Quick Override Dropdown */}
          <div
            ref={dropdownRef}
            className="relative"
            draggable={false}
            onDragStart={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              draggable={false}
              onClick={(e) => {
                e.stopPropagation();
                setShowCategoryMenu((v: boolean) => !v);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label={`Category: ${doc.category}. Click to change.`}
              aria-haspopup="true"
              aria-expanded={showCategoryMenu}
              className={`inline-flex items-center gap-1 min-h-[36px] sm:min-h-[26px] px-2.5 py-1 sm:py-0.5 rounded-full text-[11px] font-semibold border cursor-pointer select-none transition-colors ${catStyle.bg} ${catStyle.text} ${catStyle.border}`}
              title="Click to override category"
            >
              <Tag className="w-2.5 h-2.5 opacity-80" />
              <span>{doc.category}</span>
              <ChevronDown className="w-2.5 h-2.5 opacity-70" />
            </button>

            {showCategoryMenu && (
              <div
                draggable={false}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute left-0 bottom-full mb-1.5 sm:bottom-auto sm:top-full sm:mt-1.5 z-50 bg-white border border-neutral-200/90 rounded-2xl shadow-2xl p-1.5 w-44 max-w-[calc(100vw-2.5rem)] text-xs"
                role="menu"
                aria-label="Select category"
              >
                <div className="px-2 py-1 text-[10px] uppercase font-bold text-neutral-400 border-b border-neutral-100 select-none">
                  Set Category
                </div>
                <div className="py-1 space-y-0.5 max-h-52 overflow-y-auto">
                  {ALL_CATEGORIES.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      draggable={false}
                      role="menuitem"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateCategory(doc.id, cat);
                        setShowCategoryMenu(false);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onPointerDown={(e) => e.stopPropagation()}
                      className={`w-full min-h-[42px] sm:min-h-[34px] text-left px-3 py-2 sm:py-1.5 rounded-xl flex items-center justify-between hover:bg-neutral-100 cursor-pointer text-xs transition-colors ${
                        doc.category === cat ? 'font-bold text-orange-600 bg-orange-50/70' : 'text-neutral-700 font-medium'
                      }`}
                    >
                      <span>{cat}</span>
                      {doc.category === cat && <Check className="w-3.5 h-3.5 text-orange-600 stroke-[2.5]" />}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Folder Path */}
          {doc.folderPath && (
            <span className="inline-flex items-center gap-1 text-[11px] text-neutral-400 truncate max-w-[150px] sm:max-w-[220px]">
              <Folder className="w-3 h-3 shrink-0 text-neutral-400" />
              <span className="truncate" title={doc.folderPath}>{doc.folderPath}</span>
            </span>
          )}
        </div>

        {/* Quick Open Indicator */}
        <div className="flex items-center text-[11px] font-semibold text-neutral-400 group-hover:text-orange-600 transition-colors shrink-0">
          <span className="hidden sm:inline mr-0.5">Open</span>
          <ChevronRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </div>
      </div>
    </div>
  );
};
