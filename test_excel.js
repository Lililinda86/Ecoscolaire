import * as XLSX from 'xlsx';
import fs from 'fs';

const data = fs.readFileSync('A LISTE DE CLASSE AVEC MATRICULES_064322.xlsx');
const workbook = XLSX.read(data, { type: 'buffer' });
const firstSheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[firstSheetName];
const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

console.log(JSON.stringify(rawRows.slice(0, 15), null, 2));
