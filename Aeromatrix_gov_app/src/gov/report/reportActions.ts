import { buildReportPdf, reportFileName, type ReportInput } from './govReport';
import { loadReportFonts } from './fonts';
import { isNative, saveAndShare } from '../lib/native';

/** Builds the PDF (loading the font on first use) and returns it as a Blob. */
export async function reportBlob(input: ReportInput): Promise<Blob> {
  const fonts = await loadReportFonts();
  return buildReportPdf(input, fonts).output('blob');
}

/** Saves the PDF: a normal download in a browser, the phone's share sheet (save, send) inside the Android app. */
export async function downloadReport(input: ReportInput): Promise<void> {
  const fonts = await loadReportFonts();
  const doc = buildReportPdf(input, fonts);
  if (isNative()) {
    await saveAndShare(reportFileName(input), doc.output('blob'), 'AeroMatrix report');
    return;
  }
  doc.save(reportFileName(input));
}
