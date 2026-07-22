// src/utils/studentCsvExport.ts

export const neutralizeSpreadsheetFormula = (
  value: unknown
): string => {
  if (value === null || value === undefined) {
    return '';
  }

  const text = String(value);

  // Matches if text starts with =, +, -, @ (possibly preceded by whitespace)
  // eslint-disable-next-line no-control-regex
  if (/^[\s\u0000-\u001F\u007F]*[=+\-@]/.test(text)) {
    // Avoid double apostrophe prefixing if already prefixed
    if (text.startsWith("'")) {
      return text;
    }
    return `'${text}`;
  }

  return text;
};

export const escapeCsvCell = (
  value: unknown,
  separator = ';'
): string => {
  const safeText = neutralizeSpreadsheetFormula(value);

  if (
    safeText.includes(separator) ||
    safeText.includes('"') ||
    safeText.includes('\n') ||
    safeText.includes('\r')
  ) {
    return `"${safeText.replace(/"/g, '""')}"`;
  }

  return safeText;
};

export const sanitizeCsvFilenameSegment = (text: string | null | undefined): string => {
  if (!text) return '';
  let cleaned = text.trim()
    .replace(/[/\\]/g, '-') // Replace slashes with dashes
    .replace(/\s+/g, '') // Remove all whitespace
    .replace(/[^a-zA-Z0-9-]/g, '') // Remove forbidden characters
    .replace(/-+/g, '-'); // Collapse multiple dashes

  // Remove leading and trailing dashes
  if (cleaned.startsWith('-')) cleaned = cleaned.slice(1);
  if (cleaned.endsWith('-')) cleaned = cleaned.slice(0, -1);

  return cleaned;
};

export const getGuardianRelationshipLabel = (value?: string): string => {
  if (!value) return '';
  const val = value.trim().toLowerCase();
  if (val === 'father') return 'Père';
  if (val === 'mother') return 'Mère';
  if (val === 'other') return 'Autre';
  return '';
};

export const getStudentStatusLabel = (status?: string): string => {
  const val = (status || 'nouveau').trim().toLowerCase();
  if (val === 'nouveau') return 'Nouveau';
  if (val === 'ancien') return 'Ancien';
  return '';
};
