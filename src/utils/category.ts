import type { DocCategory } from '../types';

export const ALL_CATEGORIES: DocCategory[] = [
  'Identity',
  'Education',
  'Financial',
  'Insurance',
  'Government',
  'Medical',
  'Other',
];

export const DEFAULT_CATEGORY_RULES: Record<DocCategory, string[]> = {
  Identity: [
    'aadhar',
    'aadhaar',
    'pan',
    'passport',
    'voter',
    'driving',
    'license',
    'dl',
    'id card',
    'birth certificate',
    'ssn',
    'citizen',
  ],
  Education: [
    'marksheet',
    'degree',
    'diploma',
    'certificate',
    'transcript',
    'school',
    'college',
    'university',
    '10th',
    '12th',
    'semester',
    'grade',
    'report card',
    'curriculum',
    'academic',
    'jee',
    'neet',
    'gate',
  ],
  Financial: [
    'bank',
    'statement',
    'salary',
    'payslip',
    'tax',
    'itr',
    'form 16',
    'form16',
    'invoice',
    'receipt',
    'loan',
    'credit',
    'debit',
    'cheque',
    'pf',
    'epfo',
    'mutual fund',
    'investment',
    'dividend',
  ],
  Insurance: [
    'insurance',
    'policy',
    'premium',
    'lic',
    'mediclaim',
    'claim',
    'term life',
    'health insurance',
    'vehicle insurance',
  ],
  Government: [
    'domicile',
    'caste',
    'income certificate',
    'ration',
    'affidavit',
    'notary',
    'gazette',
    'challan',
    'pension',
    'property',
    'registry',
    'stamp paper',
  ],
  Medical: [
    'prescription',
    'report',
    'lab',
    'hospital',
    'doctor',
    'discharge',
    'vaccination',
    'covid',
    'blood',
    'scan',
    'mri',
    'xray',
    'x-ray',
    'pathology',
  ],
  Other: [],
};

interface DetermineCategoryOptions {
  name: string;
  cleanTitle?: string;
  folderPath?: string;
  manualOverride?: DocCategory;
  rules?: Record<DocCategory, string[]>;
}

/**
 * Determines the category of a document according to the strict priority:
 * 1. Manual category override
 * 2. Top-level folder name match
 * 3. Filename keyword rules
 * 4. 'Other'
 */
export function determineCategory({
  name,
  cleanTitle = '',
  folderPath = '',
  manualOverride,
  rules = DEFAULT_CATEGORY_RULES,
}: DetermineCategoryOptions): DocCategory {
  // 1. Manual override takes highest precedence
  if (manualOverride && ALL_CATEGORIES.includes(manualOverride)) {
    return manualOverride;
  }

  // 2. Top-level folder name match
  if (folderPath) {
    // folderPath may be "Personal Documents Test / Education / School" or "Education/College"
    const segments = folderPath
      .split(/[/\\]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    for (const segment of segments) {
      const matchedCat = ALL_CATEGORIES.find(
        (cat) => cat.toLowerCase() === segment.toLowerCase()
      );
      if (matchedCat && matchedCat !== 'Other') {
        return matchedCat;
      }
    }
  }

  // 3. Filename keyword rules
  const targetText = `${name} ${cleanTitle}`.toLowerCase();

  for (const cat of ALL_CATEGORIES) {
    if (cat === 'Other') continue;
    const keywords = rules[cat] || [];
    for (const kw of keywords) {
      const normalizedKw = kw.toLowerCase().trim();
      if (!normalizedKw) continue;

      // Word boundary or substring match
      const regex = new RegExp(`\\b${normalizedKw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (regex.test(targetText) || targetText.includes(normalizedKw)) {
        return cat;
      }
    }
  }

  // 4. Default fallback
  return 'Other';
}
