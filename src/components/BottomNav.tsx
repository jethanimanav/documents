import React from 'react';
import { Home, Search, Plus, Layers, Settings } from 'lucide-react';

interface BottomNavProps {
  activeTab: 'home' | 'search' | 'files';
  onTabChange: (tab: 'home' | 'search' | 'files') => void;
  onPlusClick: () => void;
  onOpenMerge: () => void;
  onOpenSettings: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabChange,
  onPlusClick,
  onOpenMerge,
  onOpenSettings,
}) => {
  return (
    <nav
      aria-label="Primary mobile navigation"
      className="fixed bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] inset-x-0 mx-auto w-[calc(100%-2rem)] max-w-sm sm:max-w-md z-40"
    >
      <div className="bg-neutral-900/95 backdrop-blur-xl text-neutral-300 border border-white/15 rounded-full px-3.5 py-2 shadow-2xl shadow-neutral-950/20 flex items-center justify-between">
        {/* Tab 1: Home */}
        <button
          type="button"
          onClick={() => onTabChange('home')}
          aria-label="Home"
          className={`flex flex-col items-center justify-center min-w-[48px] min-h-[44px] py-1 cursor-pointer transition-colors ${
            activeTab === 'home' ? 'text-white' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Home className={`w-5 h-5 ${activeTab === 'home' ? 'stroke-[2.5] text-orange-400' : ''}`} />
          <span className="text-[10px] font-semibold mt-0.5 leading-none">Home</span>
        </button>

        {/* Tab 2: Search */}
        <button
          type="button"
          onClick={() => onTabChange('search')}
          aria-label="Search documents"
          className={`flex flex-col items-center justify-center min-w-[48px] min-h-[44px] py-1 cursor-pointer transition-colors ${
            activeTab === 'search' ? 'text-white' : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Search className={`w-5 h-5 ${activeTab === 'search' ? 'stroke-[2.5] text-orange-400' : ''}`} />
          <span className="text-[10px] font-semibold mt-0.5 leading-none">Search</span>
        </button>

        {/* Central Emphasized + Button: Prepare */}
        <button
          type="button"
          onClick={onPlusClick}
          aria-label="Prepare document for upload"
          className="w-12 h-12 min-w-[48px] min-h-[48px] -my-3 rounded-full bg-gradient-to-tr from-orange-500 via-amber-500 to-orange-400 text-white shadow-lg shadow-orange-500/35 flex items-center justify-center cursor-pointer active:scale-95 hover:scale-105 transition-all ring-4 ring-neutral-900"
        >
          <Plus className="w-6 h-6 stroke-[2.5]" />
        </button>

        {/* Tab 3: Merge / Tools */}
        <button
          type="button"
          onClick={onOpenMerge}
          aria-label="Merge PDFs"
          className="flex flex-col items-center justify-center min-w-[48px] min-h-[44px] py-1 cursor-pointer transition-colors text-neutral-400 hover:text-neutral-200"
        >
          <Layers className="w-5 h-5" />
          <span className="text-[10px] font-semibold mt-0.5 leading-none">Merge</span>
        </button>

        {/* Tab 4: Settings */}
        <button
          type="button"
          onClick={onOpenSettings}
          aria-label="Settings and synchronization"
          className="flex flex-col items-center justify-center min-w-[48px] min-h-[44px] py-1 cursor-pointer transition-colors text-neutral-400 hover:text-neutral-200"
        >
          <Settings className="w-5 h-5" />
          <span className="text-[10px] font-semibold mt-0.5 leading-none">Settings</span>
        </button>
      </div>
    </nav>
  );
};
