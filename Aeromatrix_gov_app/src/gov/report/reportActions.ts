import { buildReportPdf, reportFileName, type ReportInput } from './govReport';
import { loadReportFonts } from './fonts';
import { isNative, saveAndShare } from '../lib/native';
import { loadLogo, loadSatellite } from '../lib/network';

/** Makes sure the satellite picture and the logo are loaded before the PDF is drawn. */
async function withAssets(input: ReportInput): Promise<ReportInput> {
  const [networkImage, logo] = await Promise.all([
    input.network && !input.networkImage ? loadSatellite(input.network) : Promise.resolve(input.networkImage ?? null),
    input.logo ? Promise.resolve(input.logo) : loadLogo(),
  ]);
  return { ...input, networkImage, logo };
}

/** Builds the PDF (loading the font on first use) and returns it as a Blob. */
export async function reportBlob(input: ReportInput): Promise<Blob> {
  const fonts = await loadReportFonts();
  return buildReportPdf(await withAssets(input), fonts).output('blob');
}

/** Saves the PDF: a normal download in a browser, the phone's share sheet (save, send) inside the Android app. */
export async function downloadReport(input: ReportInput): Promise<void> {
  const fonts = await loadReportFonts();
  const full = await withAssets(input);
  const doc = buildReportPdf(full, fonts);
  if (isNative()) {
    await saveAndShare(reportFileName(input), doc.output('blob'), 'AeroMatrix report');
    return;
  }
  doc.save(reportFileName(input));
}
