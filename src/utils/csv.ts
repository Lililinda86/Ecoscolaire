export const generateCSVTemplate = () => {
  // Columns matching our Student object loosely
  const headers = ['Nom Complet', 'Sexe (M/F)', 'Date de Naissance (JJ/MM/AAAA)', 'Nom du Tuteur', 'Contact', 'Adresse'];

  // Add a fake row as example
  const exampleRow = ['Jean Dupont', 'M', '15/05/2015', 'Paul Dupont', '612345678', 'Quartier Bastos'];

  const csvContent = "data:text/csv;charset=utf-8,\uFEFF"
    + headers.join(";") + "\n"
    + exampleRow.join(";");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", "Modele_Import_Eleves.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const parseCSV = (content: string, separator: string = ';'): any[] => {
  // Simple CSV parser that handles basic rows. 
  // Excel in French regions uses ';' by default for CSV.
  const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
  if (lines.length < 2) return []; // Only headers or empty

  // If first line has more commas than semicolons, auto-detect comma
  const headerLine = lines[0];
  if (headerLine.split(',').length > headerLine.split(';').length) {
    separator = ',';
  }

  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const rawCols = lines[i].split(separator);
    const cols = rawCols.map(c => c.replace(/^"|"$/g, '').trim()); // Strip quotes if any

    // Skip empty completely empty rows
    if (cols.every(c => !c)) continue;

    result.push({
      nom: cols[0] || '',
      sexe: (cols[1] || '').toUpperCase() === 'F' ? 'F' : 'M',
      // Convert JJ/MM/AAAA to YYYY-MM-DD for native HTML5 date input compatibility
      dateNaiss: convertDate(cols[2] || ''),
      tuteur: cols[3] || '',
      contact: cols[4] || '',
      adresse: cols[5] || ''
    });
  }
  return result;
};

const convertDate = (dateStr: string): string => {
  // Tries to convert 15/05/2015 to 2015-05-15
  if (!dateStr) return '';
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    // Basic validation
    if (parts[0].length === 2 && parts[2].length === 4) {
      return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
  }
  // Try to parse standard YYYY-MM-DD
  if (dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return dateStr;
  }
  return new Date().toISOString().split('T')[0]; // fallback
};
