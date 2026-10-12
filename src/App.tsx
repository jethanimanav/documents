import React, { useEffect, useState } from 'react';
import {
  FileText,
  WifiOff,
  Settings,
} from 'lucide-react';
import { ReconnectBanner } from './components/ReconnectBanner';
import { DocumentList } from './components/DocumentList';
import { BottomNav } from './components/BottomNav';
import { SettingsModal } from './components/SettingsModal';
import { ImageCompressModal } from './components/ImageCompressModal';
import { PdfCompressModal } from './components/PdfCompressModal';
import { PdfManagePagesModal } from './components/PdfManagePagesModal';
import { PdfMergeModal } from './components/PdfMergeModal';
import { DocumentPreviewModal } from './components/DocumentPreviewModal';
import { DocumentDetailsModal } from './components/DocumentDetailsModal';
import { ImagesToPdfModal } from './components/ImagesToPdfModal';
import { PwaBanner } from './components/PwaBanner';
import { useAuth } from './hooks/useAuth';
import { usePwa } from './hooks/usePwa';
import { authService } from './services/auth';
import { db, getSetting, setSetting } from './services/db';
import type { DocItem } from './types';

export const App: React.FC = () => {
  const { isAuthenticated, needsReconnect, user, reconnect } = useAuth();
  const {
    needRefresh,
    offlineReady,
    isInstallable,
    isStandalone,
    isIOS,
    updateServiceWorker,
    dismissRefresh,
    promptInstall,
  } = usePwa();
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocItem | null>(null);
  const [activeNavTab, setActiveNavTab] = useState<'home' | 'search' | 'files'>('home');

  // PDF Tool Mode ('compress' vs 'pages') & in-memory Blob cache
  const [pdfToolMode, setPdfToolMode] = useState<'compress' | 'pages'>('compress');
  const [cachedPdfBlob, setCachedPdfBlob] = useState<Blob | null>(null);
  const [cachedImageBlob, setCachedImageBlob] = useState<Blob | null>(null);

  // PDF Merge & Images to PDF state
  const [isMergeModalOpen, setIsMergeModalOpen] = useState(false);
  const [isImagesToPdfOpen, setIsImagesToPdfOpen] = useState(false);
  const [mergeInitialDoc, setMergeInitialDoc] = useState<DocItem | null>(null);
  const [libraryDocs, setLibraryDocs] = useState<DocItem[]>([]);

  // In-App Document Preview Modal state
  const [previewDoc, setPreviewDoc] = useState<DocItem | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // Document Details & Expiry Reminders state (Milestone 3)
  const [detailsDoc, setDetailsDoc] = useState<DocItem | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [pinnedDocIds, setPinnedDocIds] = useState<string[]>([]);

  const handleOpenCompress = (doc: DocItem, blob?: Blob | null) => {
    setSelectedDoc(doc);
    setPdfToolMode('compress');
    if (doc.mimeType === 'application/pdf' || /\.pdf$/i.test(doc.name)) {
      setCachedPdfBlob(blob || null);
      setCachedImageBlob(null);
    } else {
      setCachedImageBlob(blob || null);
      setCachedPdfBlob(null);
    }
  };

  useEffect(() => {
    // Initialize Google Identity Services and load stored client ID
    authService.init();
    getSetting<string[]>('pinned_doc_ids', []).then((ids) => setPinnedDocIds(ids));

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleOpenMergeModal = async (initialDoc?: DocItem | null) => {
    const all = await db.docs.toArray();
    setLibraryDocs(all);
    setMergeInitialDoc(initialDoc || null);
    setIsMergeModalOpen(true);
  };

  const handleOpenImagesToPdf = async () => {
    const all = await db.docs.toArray();
    setLibraryDocs(all);
    setIsImagesToPdfOpen(true);
  };

  return (
    <div className="min-h-screen text-neutral-900 flex flex-col font-sans selection:bg-orange-500 selection:text-white">
      {/* Persistent Reconnect Banner for 401 & Token Expiry */}
      <ReconnectBanner onOpenSettings={() => setIsSettingsOpen(true)} />

      {/* Top Header */}
      <header
        className={`sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-neutral-200/60 transition-all pt-[env(safe-area-inset-top,0px)] ${
          needsReconnect ? 'pt-16 sm:pt-14' : ''
        }`}
      >
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-orange-500 via-amber-500 to-orange-400 flex items-center justify-center text-white shadow-md shadow-orange-500/25 shrink-0">
              <FileText className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div>
              <h1 className="font-extrabold text-base tracking-tight text-neutral-900 leading-none">
                Personal Docs
              </h1>
              <p className="text-[10px] text-neutral-500 font-semibold tracking-wider uppercase mt-1 leading-none">
                Find &bull; Prepare &bull; Share
              </p>
            </div>
          </div>

          {/* Header Controls: Offline Badge, Auth Status, Settings */}
          <div className="flex items-center gap-2">
            {/* Online / Offline badge */}
            <div
              className={`flex items-center gap-1.5 px-2 sm:px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                isOnline
                  ? 'bg-neutral-100 text-neutral-600 border-neutral-200/80'
                  : 'bg-amber-100 text-amber-800 border-amber-300'
              }`}
              title={isOnline ? 'Online' : 'Offline — cached documents available'}
            >
              {isOnline ? (
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              ) : (
                <WifiOff className="w-3 h-3 text-amber-600" />
              )}
              <span className="hidden sm:inline">{isOnline ? 'Online' : 'Offline'}</span>
            </div>

            {/* Google Auth Status Pill */}
            <button
              type="button"
              onClick={() => {
                if (needsReconnect) {
                  reconnect();
                } else {
                  setIsSettingsOpen(true);
                }
              }}
              aria-label={
                isAuthenticated
                  ? `Google account connected: ${user?.displayName || 'User'}`
                  : needsReconnect
                  ? 'Reconnect Google Drive account'
                  : 'Connect Google Drive account'
              }
              className={`min-h-[38px] flex items-center gap-1.5 px-2.5 sm:px-3 py-1 rounded-full text-xs font-semibold cursor-pointer border transition-all ${
                isAuthenticated
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                  : needsReconnect
                  ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                  : 'bg-neutral-100 text-neutral-700 border-neutral-200 hover:bg-neutral-200'
              }`}
            >
              {user?.displayName ? (
                <span className="w-5 h-5 rounded-full bg-neutral-900 text-white font-bold text-[10px] flex items-center justify-center shrink-0">
                  {user.displayName.charAt(0).toUpperCase()}
                </span>
              ) : (
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    isAuthenticated ? 'bg-emerald-500' : needsReconnect ? 'bg-amber-500 animate-ping' : 'bg-neutral-400'
                  }`}
                />
              )}
              <span className="text-xs hidden min-[400px]:inline">
                {isAuthenticated
                  ? user?.displayName
                    ? user.displayName.split(' ')[0]
                    : 'Connected'
                  : needsReconnect
                  ? 'Reconnect'
                  : 'Connect'}
              </span>
            </button>

            {/* Settings Button */}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              aria-label="Settings and synchronization"
              className="min-w-[38px] min-h-[38px] flex items-center justify-center rounded-full bg-white hover:bg-neutral-100 active:bg-neutral-200 border border-neutral-200/80 text-neutral-600 hover:text-neutral-900 cursor-pointer transition-colors shadow-xs"
              title="Settings & Synchronization"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* Document Library Home Screen */}
        <DocumentList
          isOnline={isOnline}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onSelectDoc={(doc, blob) => {
            setPreviewDoc(doc);
            setPreviewBlob(blob || null);
            setIsPreviewOpen(true);
          }}
          onPrepareDoc={(doc, blob) => {
            handleOpenCompress(doc, blob);
          }}
          onOpenMerge={(doc, blob) => {
            handleOpenMergeModal(doc);
            if (blob) setCachedPdfBlob(blob);
          }}
          onOpenManagePages={(doc, blob) => {
            if (doc) {
              setSelectedDoc(doc);
              setPdfToolMode('pages');
              setCachedPdfBlob(blob || null);
            }
          }}
          onOpenDetails={(doc) => {
            setDetailsDoc(doc);
            setIsDetailsOpen(true);
          }}
          onOpenImagesToPdf={handleOpenImagesToPdf}
        />
      </main>

      {/* Mobile Floating Bottom Navigation */}
      <BottomNav
        activeTab={activeNavTab}
        onTabChange={(tab) => {
          setActiveNavTab(tab);
          if (tab === 'home') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          } else if (tab === 'search') {
            const input = document.querySelector('input[type="text"]') as HTMLInputElement;
            if (input) {
              input.focus();
              input.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }
        }}
        onPlusClick={() => {
          // Open PDF merge or first recent file
          handleOpenMergeModal();
        }}
        onOpenMerge={() => handleOpenMergeModal()}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />

      {/* In-App Document Preview Modal */}
      <DocumentPreviewModal
        doc={previewDoc}
        isOpen={isPreviewOpen}
        cachedBlob={previewBlob}
        onClose={() => {
          setIsPreviewOpen(false);
          setPreviewDoc(null);
          setPreviewBlob(null);
        }}
        onOpenCompress={(doc, blob) => {
          handleOpenCompress(doc, blob);
        }}
        onOpenManagePages={(doc, blob) => {
          setSelectedDoc(doc);
          setPdfToolMode('pages');
          setCachedPdfBlob(blob);
        }}
        onOpenMerge={(doc, blob) => {
          handleOpenMergeModal(doc);
          if (blob) setCachedPdfBlob(blob);
        }}
      />

      {/* PDF Compression & Target-Size Modal (Step 4) */}
      <PdfCompressModal
        doc={selectedDoc}
        isOpen={Boolean(
          selectedDoc &&
            (selectedDoc.mimeType === 'application/pdf' || /\.pdf$/i.test(selectedDoc.name)) &&
            pdfToolMode === 'compress'
        )}
        onClose={() => {
          setSelectedDoc(null);
          setCachedPdfBlob(null);
        }}
        onOpenManagePages={() => setPdfToolMode('pages')}
        onOpenMerge={async (doc) => {
          const all = await db.docs.toArray();
          setLibraryDocs(all);
          setSelectedDoc(null);
          setCachedPdfBlob(null);
          setMergeInitialDoc(doc);
          setIsMergeModalOpen(true);
        }}
        cachedBlob={cachedPdfBlob}
        onBlobLoaded={(blob) => setCachedPdfBlob(blob)}
      />

      {/* PDF Page Management (Extract, Delete, Rotate, Reorder) Modal (Step 5) */}
      <PdfManagePagesModal
        doc={selectedDoc}
        isOpen={Boolean(
          selectedDoc &&
            (selectedDoc.mimeType === 'application/pdf' || /\.pdf$/i.test(selectedDoc.name)) &&
            pdfToolMode === 'pages'
        )}
        onClose={() => {
          setSelectedDoc(null);
          setCachedPdfBlob(null);
        }}
        onOpenCompress={() => setPdfToolMode('compress')}
        onOpenMerge={async (doc) => {
          const all = await db.docs.toArray();
          setLibraryDocs(all);
          setSelectedDoc(null);
          setCachedPdfBlob(null);
          setMergeInitialDoc(doc);
          setIsMergeModalOpen(true);
        }}
        preloadedBlob={cachedPdfBlob}
        onBlobLoaded={(blob) => setCachedPdfBlob(blob)}
      />

      {/* PDF Merge Modal (Step 5) */}
      <PdfMergeModal
        isOpen={isMergeModalOpen}
        onClose={() => {
          setIsMergeModalOpen(false);
          setMergeInitialDoc(null);
        }}
        availableDocs={libraryDocs}
        initialSelectedDoc={mergeInitialDoc}
      />

      {/* Convert Images to PDF Modal (Milestone 4) */}
      <ImagesToPdfModal
        isOpen={isImagesToPdfOpen}
        onClose={() => setIsImagesToPdfOpen(false)}
        availableDocs={libraryDocs}
      />

      {/* Image Compression & Upload-Size Modal (Step 3) */}
      <ImageCompressModal
        doc={selectedDoc}
        isOpen={Boolean(
          selectedDoc &&
            selectedDoc.mimeType !== 'application/pdf' &&
            !/\.pdf$/i.test(selectedDoc.name)
        )}
        onClose={() => {
          setSelectedDoc(null);
          setCachedImageBlob(null);
        }}
        cachedBlob={cachedImageBlob}
      />

      {/* Document Details & Expiry Reminders Modal (Milestone 3) */}
      <DocumentDetailsModal
        doc={detailsDoc}
        isOpen={isDetailsOpen}
        isPinned={pinnedDocIds.includes(detailsDoc?.id || '')}
        onTogglePin={(id) => {
          setPinnedDocIds((prev) => {
            const next = prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id];
            setSetting('pinned_doc_ids', next);
            return next;
          });
        }}
        onClose={() => {
          setIsDetailsOpen(false);
          setDetailsDoc(null);
        }}
      />

      {/* Settings & Synchronization Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        isInstallable={isInstallable}
        isStandalone={isStandalone}
        isIOS={isIOS}
        onPromptInstall={promptInstall}
      />

      {/* PWA Update, Offline & Install Promotion Banner */}
      <PwaBanner
        needRefresh={needRefresh}
        offlineReady={offlineReady}
        isInstallable={isInstallable}
        isStandalone={isStandalone}
        isIOS={isIOS}
        onUpdate={() => updateServiceWorker(true)}
        onDismissRefresh={dismissRefresh}
        onPromptInstall={promptInstall}
      />

      {/* Footer */}
      <footer className="border-t border-stone-200/80 py-6 pb-[max(5.5rem,env(safe-area-inset-bottom,0px))] md:pb-6 text-center text-xs text-stone-400 font-medium tracking-wide">
        Personal Documents &bull; 100% Client-Side &bull; Strictly Read-Only
      </footer>
    </div>
  );
};

export default App;
