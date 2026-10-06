import { describe, it, expect, beforeEach } from 'vitest';
import { searchIndex } from '../searchIndex';
import type { DocItem } from '../../types';

describe('Search Index Service (MiniSearch)', () => {
  const sampleDocs: DocItem[] = [
    {
      id: 'doc-1',
      name: '10th_Marksheet.pdf',
      cleanTitle: '10th Marksheet',
      folderPath: 'Personal Documents Test / Education / School',
      parentId: 'folder-school',
      category: 'Education',
      mimeType: 'application/pdf',
      size: 3200000,
      modifiedTime: '2024-01-01T00:00:00Z',
    },
    {
      id: 'doc-2',
      name: '12th_Marksheet.pdf',
      cleanTitle: '12th Marksheet',
      folderPath: 'Personal Documents Test / Education / HighSchool',
      parentId: 'folder-highschool',
      category: 'Education',
      mimeType: 'application/pdf',
      size: 2800000,
      modifiedTime: '2024-01-02T00:00:00Z',
    },
    {
      id: 'doc-3',
      name: 'PAN_Card.pdf',
      cleanTitle: 'PAN Card',
      folderPath: 'Personal Documents Test / Identity',
      parentId: 'folder-id',
      category: 'Identity',
      mimeType: 'application/pdf',
      size: 450000,
      modifiedTime: '2024-01-03T00:00:00Z',
    },
    {
      id: 'doc-4',
      name: 'Bank_Statement_Jan.pdf',
      cleanTitle: 'Bank Statement Jan',
      folderPath: 'Personal Documents Test / Financial / Banking',
      parentId: 'folder-bank',
      category: 'Financial',
      mimeType: 'application/pdf',
      size: 1100000,
      modifiedTime: '2024-01-04T00:00:00Z',
    },
    {
      id: 'doc-5',
      name: 'Test_Aadhar.pdf',
      cleanTitle: 'Test Aadhar',
      folderPath: 'Personal Documents Test',
      parentId: 'root-folder-1',
      category: 'Identity',
      mimeType: 'application/pdf',
      size: 250000,
      modifiedTime: '2024-01-05T00:00:00Z',
    },
  ];

  beforeEach(() => {
    searchIndex.initialize(sampleDocs);
  });

  it('initializes index and returns all documents when query is empty', () => {
    const results = searchIndex.search('');
    expect(results.length).toBe(sampleDocs.length);
  });

  it('searches by prefix: "10th"', () => {
    const results = searchIndex.search('10th');
    expect(results.length).toBe(1);
    expect(results[0].cleanTitle).toBe('10th Marksheet');
  });

  it('searches by folder path keyword: "School"', () => {
    const results = searchIndex.search('School');
    expect(results.some((d) => d.id === 'doc-1')).toBe(true);
  });

  it('searches by category: "Identity"', () => {
    const results = searchIndex.search('Identity');
    expect(results.some((d) => d.id === 'doc-3')).toBe(true);
    expect(results.some((d) => d.id === 'doc-5')).toBe(true);
  });

  it('filters by category chip', () => {
    const results = searchIndex.search('', 'Financial');
    expect(results.length).toBe(1);
    expect(results[0].cleanTitle).toBe('Bank Statement Jan');
  });

  it('supports fuzzy search for typos: "Aadhr"', () => {
    const results = searchIndex.search('Aadhr');
    expect(results.some((d) => d.cleanTitle === 'Test Aadhar')).toBe(true);
  });

  it('upserts updated documents and updates search results', () => {
    const updatedDoc: DocItem = {
      ...sampleDocs[0],
      cleanTitle: '10th Secondary School Certificate',
    };
    searchIndex.upsertDocs([updatedDoc]);

    const results = searchIndex.search('Secondary');
    expect(results.length).toBe(1);
    expect(results[0].id).toBe('doc-1');
  });

  it('removes deleted documents from index', () => {
    searchIndex.removeDocs(['doc-3']);
    const results = searchIndex.search('PAN');
    expect(results.length).toBe(0);
    expect(searchIndex.getDoc('doc-3')).toBeUndefined();
  });

  it('performs sub-50ms search on 500 documents (fast in-memory benchmark)', () => {
    const largeDocSet: DocItem[] = Array.from({ length: 500 }, (_, i) => ({
      id: `doc-${i}`,
      name: `Document_${i}_School_Report.pdf`,
      cleanTitle: `Document ${i} School Report`,
      folderPath: `Personal Documents Test / Education / Batch_${i % 10}`,
      parentId: `folder-${i % 10}`,
      category: i % 2 === 0 ? 'Education' : 'Financial',
      mimeType: 'application/pdf',
      size: 1000 + i,
      modifiedTime: new Date().toISOString(),
    }));

    searchIndex.initialize(largeDocSet);

    const start = performance.now();
    const results = searchIndex.search('Report Batch_3', 'Education');
    const elapsed = performance.now() - start;

    expect(results.length).toBeGreaterThan(0);
    // Target: results under 50ms (well under one frame at 60fps)
    expect(elapsed).toBeLessThan(50);
  });
});
