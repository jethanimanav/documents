import React, { useState, useEffect } from 'react';
import {
  X,
  FileText,
  Calendar,
  Tag,
  Clock,
  Pin,
  Save,
  AlertTriangle,
  CheckCircle2,
  Info,
  Folder,
} from 'lucide-react';
import type { DocItem } from '../types';
import {
  getDocumentDetails,
  saveDocumentDetails,
  type DocumentDetailRecord,
} from '../services/db';
import {
  calculateExpiryStatus,
  formatDisplayDate,
  type ExpiryCalculation,
} from '../utils/documentDetails';
import { formatFileSize } from '../utils/folder';

interface DocumentDetailsModalProps {
  doc: DocItem | null;
  isOpen: boolean;
  isPinned: boolean;
  onTogglePin: (id: string) => void;
  onClose: () => void;
  onDetailsUpdated?: () => void;
}

export const DocumentDetailsModal: React.FC<DocumentDetailsModalProps> = ({
  doc,
  isOpen,
  isPinned,
  onTogglePin,
  onClose,
  onDetailsUpdated,
}) => {
  const [notes, setNotes] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [labelInput, setLabelInput] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [reminderLeadDays, setReminderLeadDays] = useState<number>(30);
  const [isDismissed, setIsDismissed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Load details from IndexedDB on open
  useEffect(() => {
    if (!isOpen || !doc) {
      setNotes('');
      setLabels([]);
      setLabelInput('');
      setExpiryDate('');
      setReminderLeadDays(30);
      setIsDismissed(false);
      setSaveSuccess(false);
      return;
    }

    let isMounted = true;
    getDocumentDetails(doc.id).then((record) => {
      if (isMounted && record) {
        setNotes(record.notes || '');
        setLabels(record.labels || []);
        setExpiryDate(record.expiryDate || '');
        setReminderLeadDays(record.reminderLeadDays ?? 30);
        setIsDismissed(record.isDismissed ?? false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [isOpen, doc]);

  // Keyboard dismissal
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !doc) return null;

  const expiryCalc: ExpiryCalculation = calculateExpiryStatus(expiryDate, reminderLeadDays);

  const handleAddLabel = () => {
    const trimmed = labelInput.trim();
    if (trimmed && !labels.includes(trimmed)) {
      setLabels([...labels, trimmed]);
      setLabelInput('');
    }
  };

  const handleRemoveLabel = (toRemove: string) => {
    setLabels(labels.filter((l) => l !== toRemove));
  };

  const handleSave = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const record: DocumentDetailRecord = {
        fileId: doc.id,
        notes: notes.trim(),
        labels,
        expiryDate: expiryDate.trim() || undefined,
        reminderLeadDays,
        isDismissed,
        updatedAt: Date.now(),
      };

      await saveDocumentDetails(record);
      setSaveSuccess(true);
      onDetailsUpdated?.();
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error('Failed to save details:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClearExpiry = () => {
    setExpiryDate('');
    setIsDismissed(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="doc-details-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200 pt-[max(0.75rem,env(safe-area-inset-top,0px))] pb-[max(0.75rem,env(safe-area-inset-bottom,0px))] pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))]"
    >
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-full max-w-lg max-h-[92dvh] flex flex-col shadow-2xl overflow-hidden text-neutral-100">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-800 flex items-center justify-between">
          <div className="min-w-0 flex-1 pr-3">
            <div className="flex items-center gap-2">
              <h2 id="doc-details-title" className="text-base font-bold text-white truncate">
                {doc.cleanTitle}
              </h2>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 shrink-0">
                {doc.category}
              </span>
            </div>
            <p className="text-xs text-neutral-400 truncate mt-0.5 flex items-center gap-1.5">
              <Folder className="w-3 h-3 text-neutral-500 shrink-0" />
              <span>{doc.folderPath}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close document details"
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-neutral-400 hover:text-white hover:bg-neutral-800 cursor-pointer transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5 text-xs">
          {/* Metadata Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 bg-neutral-950 rounded-2xl border border-neutral-800/80">
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-500 block">File Size</span>
              <span className="font-mono text-neutral-200">{formatFileSize(doc.size)}</span>
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-500 block">Drive Modified</span>
              <span className="text-neutral-200">
                {doc.modifiedTime ? formatDisplayDate(doc.modifiedTime.split('T')[0]) : 'Unknown'}
              </span>
            </div>
            <div className="col-span-2 sm:col-span-1 flex items-center justify-between sm:justify-start gap-2">
              <span className="text-[10px] uppercase font-bold text-neutral-500 block">Pinned</span>
              <button
                type="button"
                onClick={() => onTogglePin(doc.id)}
                className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-colors ${
                  isPinned
                    ? 'bg-amber-400/20 text-amber-300 border border-amber-400/40'
                    : 'bg-neutral-800 text-neutral-400 hover:text-neutral-200'
                }`}
              >
                <Pin className={`w-3 h-3 ${isPinned ? 'fill-amber-400' : ''}`} />
                <span>{isPinned ? 'Pinned' : 'Pin'}</span>
              </button>
            </div>
          </div>

          {/* Expiry Date & Reminders Section */}
          <div className="space-y-3 p-4 bg-neutral-950 rounded-2xl border border-neutral-800">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-neutral-200 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-orange-400" />
                <span>Document Expiry & Renewal</span>
              </label>
              {expiryDate && (
                <button
                  type="button"
                  onClick={handleClearExpiry}
                  className="text-[11px] text-neutral-400 hover:text-rose-400 cursor-pointer"
                >
                  Clear date
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-neutral-400 block mb-1">Expiry Date</label>
                <input
                  type="date"
                  value={expiryDate}
                  onChange={(e) => setExpiryDate(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-white outline-none focus:border-orange-500 transition-colors"
                />
              </div>

              <div>
                <label className="text-[11px] text-neutral-400 block mb-1">Reminder Lead Time</label>
                <select
                  value={reminderLeadDays}
                  onChange={(e) => setReminderLeadDays(Number(e.target.value))}
                  disabled={!expiryDate}
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-white outline-none focus:border-orange-500 disabled:opacity-50 transition-colors"
                >
                  <option value={7}>7 days before</option>
                  <option value={15}>15 days before</option>
                  <option value={30}>30 days before</option>
                  <option value={60}>60 days before</option>
                  <option value={90}>90 days before</option>
                </select>
              </div>
            </div>

            {/* Expiry Status Badge */}
            {expiryDate && (
              <div
                className={`p-3 rounded-xl border flex items-center justify-between gap-2 text-xs font-medium ${
                  expiryCalc.status === 'expired'
                    ? 'bg-rose-950/40 border-rose-800/80 text-rose-300'
                    : expiryCalc.status === 'upcoming'
                    ? 'bg-amber-950/40 border-amber-800/80 text-amber-300'
                    : 'bg-emerald-950/30 border-emerald-800/60 text-emerald-300'
                }`}
              >
                <div className="flex items-center gap-2">
                  {expiryCalc.status === 'expired' ? (
                    <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  ) : expiryCalc.status === 'upcoming' ? (
                    <Clock className="w-4 h-4 text-amber-400 shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                  <span>{expiryCalc.label}</span>
                </div>

                {(expiryCalc.status === 'expired' || expiryCalc.status === 'upcoming') && (
                  <button
                    type="button"
                    onClick={() => setIsDismissed(!isDismissed)}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer transition-colors ${
                      isDismissed
                        ? 'bg-neutral-800 text-neutral-400 hover:text-white'
                        : 'bg-neutral-800 text-white hover:bg-neutral-700'
                    }`}
                  >
                    {isDismissed ? 'Dismissed ✓' : 'Dismiss alert'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Custom Labels / Tags Section */}
          <div className="space-y-2 p-4 bg-neutral-950 rounded-2xl border border-neutral-800">
            <label className="text-xs font-bold text-neutral-200 flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5 text-blue-400" />
              <span>Custom Labels & Tags</span>
            </label>

            <div className="flex gap-2">
              <input
                type="text"
                value={labelInput}
                onChange={(e) => setLabelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddLabel();
                  }
                }}
                placeholder="Add a label (e.g. KYC, Tax2025, Urgent)..."
                className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-white placeholder-neutral-500 outline-none focus:border-blue-500 transition-colors"
              />
              <button
                type="button"
                onClick={handleAddLabel}
                disabled={!labelInput.trim()}
                className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 text-white rounded-xl font-semibold cursor-pointer transition-colors"
              >
                Add
              </button>
            </div>

            {labels.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {labels.map((l) => (
                  <span
                    key={l}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-950/40 border border-blue-800/60 text-blue-300 text-[11px] font-semibold"
                  >
                    <span>{l}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveLabel(l)}
                      aria-label={`Remove label ${l}`}
                      className="hover:text-white cursor-pointer ml-0.5"
                    >
                      &times;
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* User Notes Section */}
          <div className="space-y-2 p-4 bg-neutral-950 rounded-2xl border border-neutral-800">
            <label className="text-xs font-bold text-neutral-200 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-emerald-400" />
              <span>Personal Notes & References</span>
            </label>
            <textarea
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add important details, reference IDs, renewal instructions, or notes here..."
              className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-3 text-white placeholder-neutral-500 outline-none focus:border-emerald-500 transition-colors leading-relaxed"
            />
          </div>

          {/* Privacy Disclaimer */}
          <div className="flex items-start gap-2 p-3 bg-neutral-950/60 rounded-xl border border-neutral-800/60 text-neutral-400 text-[11px]">
            <Info className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
            <p>
              Notes, tags, and expiry reminders are saved locally in your browser’s IndexedDB. They
              will never modify or upload back to your Google Drive files.
            </p>
          </div>
        </div>

        {/* Action Footer */}
        <div className="p-4 sm:p-5 border-t border-neutral-800 flex items-center justify-between gap-3 bg-neutral-950">
          <div className="flex items-center gap-2">
            {saveSuccess && (
              <span className="text-emerald-400 font-medium text-xs flex items-center gap-1 animate-in fade-in">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Saved locally
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-semibold cursor-pointer transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => handleSave()}
              disabled={isSaving}
              className="px-5 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 active:bg-orange-700 text-white font-semibold flex items-center gap-1.5 cursor-pointer transition-colors shadow-lg shadow-orange-600/20 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Save Details'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
