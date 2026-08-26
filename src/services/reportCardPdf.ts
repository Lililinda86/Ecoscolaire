import { jsPDF } from 'jspdf';
import type { DateLike, ReportCard, ReportCardSnapshot, ReportCardSubjectResult } from '../types';

const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;
const MARGIN_MM = 14;
const CONTENT_WIDTH_MM = A4_WIDTH_MM - (MARGIN_MM * 2);

const dateText = (value: DateLike | undefined): string => {
  if (!value) return '-';
  const candidate = typeof value === 'object' && value && 'toDate' in value && typeof value.toDate === 'function'
    ? value.toDate()
    : new Date(value as string | number | Date);
  return Number.isNaN(candidate.getTime()) ? '-' : candidate.toLocaleDateString('fr-FR');
};

const averageText = (value: number | null): string => value === null
  ? '-'
  : value.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const statusText = (subject: ReportCardSubjectResult): string => {
  if (subject.status === 'NOT_EVALUATED') return 'Non évalué';
  if (subject.status === 'NO_CALCULABLE_GRADE') return 'Note manquante';
  if (subject.status === 'MISSING_COEFFICIENT') return 'Coefficient manquant';
  const details = [
    subject.absenceCount ? `Absent: ${subject.absenceCount}` : '',
    subject.excusedCount ? `Excusé: ${subject.excusedCount}` : '',
  ].filter(Boolean);
  return details.length ? details.join(' - ') : 'Validé';
};

const publishedSnapshot = (reportCard: ReportCard): ReportCardSnapshot => {
  if (reportCard.status !== 'published' || !reportCard.officialSnapshot) {
    throw new Error('REPORT_CARD_NOT_PUBLISHED');
  }
  return reportCard.officialSnapshot;
};

export const buildReportCardPdf = (reportCard: ReportCard): jsPDF => {
  const snapshot = publishedSnapshot(reportCard);
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  pdf.setProperties({
    title: `Bulletin ${snapshot.student.name} - ${snapshot.period.name}`,
    subject: `Bulletin scolaire ${snapshot.academicYear.name}`,
    author: 'Ecoscolaire',
    creator: 'Ecoscolaire Report Cards',
    keywords: `reportCardId=${reportCard.id}`,
  });
  if ('setFileId' in pdf && typeof pdf.setFileId === 'function') {
    pdf.setFileId((reportCard.officialSnapshotHash || reportCard.snapshotHash).slice(0, 32).toUpperCase());
  }
  if ('setCreationDate' in pdf && typeof pdf.setCreationDate === 'function') {
    pdf.setCreationDate(new Date('2000-01-01T00:00:00.000Z'));
  }

  let y = MARGIN_MM;
  const ensureSpace = (height: number) => {
    if (y + height <= A4_HEIGHT_MM - 18) return;
    pdf.addPage('a4', 'portrait');
    y = MARGIN_MM;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(10);
    pdf.text(`${snapshot.school.name} - Bulletin ${snapshot.period.name}`, MARGIN_MM, y);
    y += 8;
  };

  pdf.setTextColor(30, 41, 59);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(16);
  pdf.text(snapshot.school.name || 'Ecoscolaire', A4_WIDTH_MM / 2, y, { align: 'center' });
  y += 8;
  pdf.setFontSize(14);
  pdf.text('BULLETIN SCOLAIRE', A4_WIDTH_MM / 2, y, { align: 'center' });
  y += 5;
  pdf.setDrawColor(79, 70, 229);
  pdf.setLineWidth(0.7);
  pdf.line(MARGIN_MM, y, A4_WIDTH_MM - MARGIN_MM, y);
  y += 8;

  pdf.setFontSize(9.5);
  pdf.setFont('helvetica', 'normal');
  const identityLines = [
    `Élève: ${snapshot.student.name}`,
    `Classe: ${snapshot.class.name} | Section: ${snapshot.class.section || '-'}`,
    `Année scolaire: ${snapshot.academicYear.name} | Période: ${snapshot.period.name}`,
    `Programme: ${snapshot.program.id} | Révision: ${snapshot.program.revisionNumber}`,
  ];
  for (const line of identityLines) {
    pdf.text(line, MARGIN_MM, y);
    y += 5;
  }
  y += 3;

  const columns = [
    { label: 'Code', width: 22 },
    { label: 'Matière', width: 70 },
    { label: 'Coef.', width: 18 },
    { label: 'Moy. /20', width: 24 },
    { label: 'État', width: 48 },
  ];
  const drawTableHeader = () => {
    ensureSpace(9);
    let x = MARGIN_MM;
    pdf.setFillColor(238, 242, 255);
    pdf.rect(MARGIN_MM, y, CONTENT_WIDTH_MM, 8, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8.5);
    for (const column of columns) {
      pdf.rect(x, y, column.width, 8);
      pdf.text(column.label, x + 2, y + 5.2);
      x += column.width;
    }
    y += 8;
  };
  drawTableHeader();

  for (const subject of snapshot.subjectResults) {
    const cells = [
      subject.subjectCode || '-',
      subject.subjectName || subject.subjectId,
      subject.coefficient === null ? '-' : String(subject.coefficient),
      averageText(subject.rawAverage),
      statusText(subject),
    ];
    const wrapped = cells.map((cell, index) => pdf.splitTextToSize(cell, columns[index].width - 4) as string[]);
    const rowHeight = Math.max(8, Math.max(...wrapped.map(lines => lines.length)) * 4.2 + 3);
    ensureSpace(rowHeight + 1);
    if (y === MARGIN_MM + 8) drawTableHeader();
    let x = MARGIN_MM;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8.3);
    wrapped.forEach((lines, index) => {
      pdf.rect(x, y, columns[index].width, rowHeight);
      pdf.text(lines, x + 2, y + 4.5);
      x += columns[index].width;
    });
    y += rowHeight;
  }

  ensureSpace(32);
  y += 6;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(11);
  pdf.text(`Moyenne générale: ${averageText(snapshot.overallResult.generalAverage)} / 20`, MARGIN_MM, y);
  y += 7;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.text('Rang: non activé | Mention: non configurée | Décision de passage: hors périmètre', MARGIN_MM, y);
  y += 8;

  const comment = snapshot.directorComment || reportCard.directorComment || '';
  pdf.setFont('helvetica', 'bold');
  pdf.text('Commentaire de la direction', MARGIN_MM, y);
  y += 5;
  pdf.setFont('helvetica', 'normal');
  const commentLines = pdf.splitTextToSize(comment || 'Aucun commentaire.', CONTENT_WIDTH_MM) as string[];
  ensureSpace(commentLines.length * 4.5 + 18);
  pdf.text(commentLines, MARGIN_MM, y);
  y += commentLines.length * 4.5 + 8;
  pdf.text(`Publié le ${dateText(reportCard.publishedAt)} - Direction`, MARGIN_MM, y);

  const totalPages = pdf.getNumberOfPages();
  for (let page = 1; page <= totalPages; page += 1) {
    pdf.setPage(page);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.setTextColor(100, 116, 139);
    pdf.text(`Bulletin ${reportCard.id} - Page ${page}/${totalPages}`, A4_WIDTH_MM / 2, A4_HEIGHT_MM - 8, { align: 'center' });
  }
  return pdf;
};

export const downloadReportCardPdf = (reportCard: ReportCard): void => {
  const safeStudentId = reportCard.studentId.replace(/[^A-Za-z0-9_-]/g, '-');
  buildReportCardPdf(reportCard).save(`bulletin_${safeStudentId}_${reportCard.periodId}.pdf`);
};
