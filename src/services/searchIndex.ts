import MiniSearch from 'minisearch';
import type { DocItem, DocCategory } from '../types';
import { getSetting, setSetting } from './db';

export type SortOption =
  | 'default'
  | 'name_asc'
  | 'name_desc'
  | 'newest'
  | 'oldest'
  | 'smallest'
  | 'largest';

export type FileTypeFilter = 'all' | 'pdf' | 'image' | 'spreadsheet' | 'document' | 'other';

export interface SizeRangeFilter {
  minBytes?: number;
  maxBytes?: number;
}

export interface DateRangeFilter {
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
}

export interface SearchFilterOptions {
  query?: string;
  category?: DocCategory | 'All';
  fileType?: FileTypeFilter;
  sizeRange?: SizeRangeFilter;
  dateRange?: DateRangeFilter;
  sortBy?: SortOption;
}

export const SETTING_SEARCH_HISTORY = 'recent_search_history';

export function matchesFileType(doc: DocItem, fileType: FileTypeFilter = 'all'): boolean {
  if (fileType === 'all') return true;
  const mime = (doc.mimeType || '').toLowerCase();
  const name = (doc.name || '').toLowerCase();

  switch (fileType) {
    case 'pdf':
      return mime === 'application/pdf' || name.endsWith('.pdf');
    case 'image':
      return (
        mime.startsWith('image/') ||
        /\.(jpe?g|png|webp|gif|svg|bmp|heic|tiff?)$/i.test(name)
      );
    case 'spreadsheet':
      return (
        mime.includes('spreadsheet') ||
        mime.includes('excel') ||
        mime.includes('csv') ||
        /\.(xlsx?|csv|ods)$/i.test(name)
      );
    case 'document':
      return (
        !matchesFileType(doc, 'spreadsheet') &&
        (mime.includes('wordprocessing') ||
          mime.includes('word') ||
          mime.includes('text/') ||
          (mime.includes('document') && !mime.includes('sheet') && !mime.includes('presentation')) ||
          /\.(docx?|txt|rtf|odt|md|pages)$/i.test(name))
      );
    case 'other':
      return !(
        matchesFileType(doc, 'pdf') ||
        matchesFileType(doc, 'image') ||
        matchesFileType(doc, 'spreadsheet') ||
        matchesFileType(doc, 'document')
      );
    default:
      return true;
  }
}

export function matchesDateRange(doc: DocItem, range?: DateRangeFilter): boolean {
  if (!range || (!range.startDate && !range.endDate)) return true;
  if (!doc.modifiedTime) return false;

  const docDate = new Date(doc.modifiedTime).getTime();
  if (isNaN(docDate)) return false;

  if (range.startDate) {
    const start = new Date(range.startDate + 'T00:00:00Z').getTime();
    if (!isNaN(start) && docDate < start) return false;
  }

  if (range.endDate) {
    const end = new Date(range.endDate + 'T23:59:59.999Z').getTime();
    if (!isNaN(end) && docDate > end) return false;
  }

  return true;
}

export function matchesSizeRange(doc: DocItem, range?: SizeRangeFilter): boolean {
  if (!range || (range.minBytes === undefined && range.maxBytes === undefined)) return true;
  const size = typeof doc.size === 'number' && !isNaN(doc.size) ? doc.size : 0;

  if (range.minBytes !== undefined && size < range.minBytes) return false;
  if (range.maxBytes !== undefined && size > range.maxBytes) return false;

  return true;
}

export function sortDocs(docs: DocItem[], sortBy: SortOption = 'default'): DocItem[] {
  if (sortBy === 'default') return docs;
  const sorted = [...docs];

  switch (sortBy) {
    case 'name_asc':
      return sorted.sort((a, b) =>
        (a.cleanTitle || a.name || '').localeCompare(b.cleanTitle || b.name || '', undefined, {
          sensitivity: 'base',
          numeric: true,
        })
      );
    case 'name_desc':
      return sorted.sort((a, b) =>
        (b.cleanTitle || b.name || '').localeCompare(a.cleanTitle || a.name || '', undefined, {
          sensitivity: 'base',
          numeric: true,
        })
      );
    case 'newest':
      return sorted.sort((a, b) => {
        const timeA = a.modifiedTime ? new Date(a.modifiedTime).getTime() : 0;
        const timeB = b.modifiedTime ? new Date(b.modifiedTime).getTime() : 0;
        return (isNaN(timeB) ? 0 : timeB) - (isNaN(timeA) ? 0 : timeA);
      });
    case 'oldest':
      return sorted.sort((a, b) => {
        const timeA = a.modifiedTime ? new Date(a.modifiedTime).getTime() : 0;
        const timeB = b.modifiedTime ? new Date(b.modifiedTime).getTime() : 0;
        return (isNaN(timeA) ? 0 : timeA) - (isNaN(timeB) ? 0 : timeB);
      });
    case 'smallest':
      return sorted.sort((a, b) => (a.size || 0) - (b.size || 0));
    case 'largest':
      return sorted.sort((a, b) => (b.size || 0) - (a.size || 0));
    default:
      return sorted;
  }
}

export async function getRecentSearchHistory(): Promise<string[]> {
  return getSetting<string[]>(SETTING_SEARCH_HISTORY, []);
}

export async function addRecentSearchQuery(query: string): Promise<string[]> {
  const trimmed = query.trim();
  if (!trimmed || trimmed.length < 2) return getRecentSearchHistory();
  const current = await getRecentSearchHistory();
  const updated = [trimmed, ...current.filter((q) => q.toLowerCase() !== trimmed.toLowerCase())].slice(0, 8);
  await setSetting(SETTING_SEARCH_HISTORY, updated);
  return updated;
}

export async function clearRecentSearchHistory(): Promise<void> {
  await setSetting(SETTING_SEARCH_HISTORY, []);
}

class SearchIndexService {
  private miniSearch: MiniSearch<DocItem>;
  private docsMap: Map<string, DocItem> = new Map();

  constructor() {
    this.miniSearch = this.createMiniSearch();
  }

  private createMiniSearch(): MiniSearch<DocItem> {
    return new MiniSearch<DocItem>({
      fields: ['cleanTitle', 'name', 'folderPath', 'category'],
      storeFields: ['id'],
      searchOptions: {
        prefix: true,
        fuzzy: (term: string) => (term.length > 4 ? 0.2 : false),
        boost: { cleanTitle: 2.0, name: 1.5, category: 1.2, folderPath: 1.0 },
      },
    });
  }

  /**
   * Initializes or reloads the in-memory search index with documents.
   */
  public initialize(docs: DocItem[]): void {
    this.docsMap.clear();
    this.miniSearch = this.createMiniSearch();

    if (docs.length === 0) return;

    docs.forEach((doc) => this.docsMap.set(doc.id, doc));
    this.miniSearch.addAll(docs);
  }

  /**
   * Clears the in-memory index and documents map completely.
   */
  public clear(): void {
    this.initialize([]);
  }

  /**
   * Adds or updates documents in the search index and in-memory map.
   */
  public upsertDocs(docs: DocItem[]): void {
    if (docs.length === 0) return;

    for (const doc of docs) {
      if (this.docsMap.has(doc.id)) {
        // Discard existing document in MiniSearch before re-adding
        try {
          this.miniSearch.discard(doc.id);
        } catch {
          // If not in index, ignore
        }
      }
      this.docsMap.set(doc.id, doc);
    }

    // Vacuum if needed or re-add
    this.miniSearch.addAll(docs);
  }

  /**
   * Removes documents by ID.
   */
  public removeDocs(ids: string[]): void {
    if (ids.length === 0) return;

    for (const id of ids) {
      this.docsMap.delete(id);
      try {
        this.miniSearch.discard(id);
      } catch {
        // Ignore if not present
      }
    }
  }

  /**
   * Searches the in-memory index with support for multiple filters and sorting.
   * Backward compatible with (query, categoryFilter).
   */
  public search(
    queryOrOptions: string | SearchFilterOptions = '',
    categoryFilter?: DocCategory | 'All'
  ): DocItem[] {
    const options: SearchFilterOptions =
      typeof queryOrOptions === 'string'
        ? { query: queryOrOptions, category: categoryFilter }
        : queryOrOptions;

    return this.searchAdvanced(options);
  }

  /**
   * Executes advanced multi-faceted search across in-memory metadata.
   */
  public searchAdvanced(options: SearchFilterOptions = {}): DocItem[] {
    const {
      query = '',
      category = 'All',
      fileType = 'all',
      sizeRange,
      dateRange,
      sortBy = 'default',
    } = options;

    const trimmed = query.trim();
    let results: DocItem[] = [];

    if (!trimmed) {
      results = Array.from(this.docsMap.values());
    } else {
      const searchResults = this.miniSearch.search(trimmed);
      results = searchResults
        .map((r) => this.docsMap.get(r.id))
        .filter((doc): doc is DocItem => doc !== undefined);
    }

    // Filter by Category
    if (category && category !== 'All') {
      results = results.filter((doc) => doc.category === category);
    }

    // Filter by File Type
    if (fileType && fileType !== 'all') {
      results = results.filter((doc) => matchesFileType(doc, fileType));
    }

    // Filter by Size Range
    if (sizeRange && (sizeRange.minBytes !== undefined || sizeRange.maxBytes !== undefined)) {
      results = results.filter((doc) => matchesSizeRange(doc, sizeRange));
    }

    // Filter by Date Range
    if (dateRange && (dateRange.startDate || dateRange.endDate)) {
      results = results.filter((doc) => matchesDateRange(doc, dateRange));
    }

    // Apply Sorting
    return sortDocs(results, sortBy);
  }

  public getDoc(id: string): DocItem | undefined {
    return this.docsMap.get(id);
  }

  public getAllDocs(categoryFilter?: DocCategory | 'All'): DocItem[] {
    let all = Array.from(this.docsMap.values());
    if (categoryFilter && categoryFilter !== 'All') {
      all = all.filter((doc) => doc.category === categoryFilter);
    }
    return all;
  }

  public getCount(): number {
    return this.docsMap.size;
  }
}

export const searchIndex = new SearchIndexService();

