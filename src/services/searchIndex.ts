import MiniSearch from 'minisearch';
import type { DocItem, DocCategory } from '../types';

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
   * Searches the in-memory index. If query is blank, returns all docs.
   * Can filter by category.
   */
  public search(query: string, categoryFilter?: DocCategory | 'All'): DocItem[] {
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

    if (categoryFilter && categoryFilter !== 'All') {
      results = results.filter((doc) => doc.category === categoryFilter);
    }

    return results;
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
