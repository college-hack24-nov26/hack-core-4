/**
 * PDF of the selected Plan-It plan (jsPDF + jspdf-autotable).
 * The standard PDF fonts cannot draw the rupee sign, so amounts are written "Rs 12,34,567" consistently
 * (formatINRPdf). Only plain Latin text is written: curly quotes and dashes are mapped to ASCII.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { Plan, PlanOutcome } from './planEngine';
import { OBJECTIVE_LABEL } from './planEngine';
import { INTERVENTION_LABEL, PRICES, formatINRPdf } from './costModel';

/** Characters outside the standard PDF font range are replaced so nothing renders as a garbled glyph. */
export function pdfSafe(s: string): string {
  return s
    .replace(/₹\s?/g, 'Rs ')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/×/g, 'x')
    .replace(/[^\x20-\x7E\n]/g, '');
}

export interface PlanPdfContent {
  title: string;
  summary: Array<[string, string]>;
  assumptions: Array<[string, string]>;
  costRows: string[][];
  impact: Array<[string, string]>;
  limitations: string[];
  statuses: string[];
  sources: string[];
}

/** Everything that goes into the PDF as plain strings (so it can be tested without rendering). */
export function planPdfContent(outcome: PlanOutcome, plan: Plan, generated: Date = new Date()): PlanPdfContent {
  const a = outcome.assumptions;
  const costRows: string[][] = [];
  for (const o of plan.options) {
    costRows.push([`${INTERVENTION_LABEL[o.type]}: ${o.label}`, '', '', '', '', '']);
    for (const l of o.lines) {
      costRows.push([
        `  ${l.item}${l.note ? ` (${l.note})` : ''}`,
        l.category,
        `${l.quantity.toLocaleString('en-IN')} ${l.unit}`,
        formatINRPdf(l.unitPrice),
        formatINRPdf(l.total),
        `${l.kind === 'sourced' ? 'Sourced' : 'Estimate'}${l.recurring ? ', yearly' : ', one-time'}`,
      ]);
    }
  }
  const usedIds = new Set(plan.options.flatMap((o) => o.lines.map((l) => l.priceId)));
  const sources = [...usedIds].map((id) => {
    const p = PRICES[id];
    return p.kind === 'sourced' && p.source
      ? `${p.item}: ${p.source.name} - ${p.source.url} (accessed ${p.source.accessed}). ${p.source.note}`
      : `${p.item}: ESTIMATE. ${p.basis ?? ''}`;
  });
  const i = plan.impact;
  const limitations = [...new Set(plan.options.flatMap((o) => o.limitations))];
  return {
    title: `AeroMatrix Plan-It: Plan ${plan.id}`,
    summary: [
      ['Target', outcome.target?.label ?? ''],
      ['Budget', formatINRPdf(outcome.budget)],
      ['Objective', OBJECTIVE_LABEL[outcome.objective]],
      ['Measures', plan.options.map((o) => o.label).join('; ')],
      ['One-time cost', formatINRPdf(plan.oneTime)],
      ['First-year running cost', formatINRPdf(plan.recurring)],
      ['Total (one-time + first year)', formatINRPdf(plan.total)],
      ['Remaining budget', formatINRPdf(plan.remaining)],
      ['Why this rank', plan.reason],
      ...(plan.tradeoff ? ([['Trade-off', plan.tradeoff]] as Array<[string, string]>) : []),
    ].map(([k, v]) => [k, pdfSafe(v)] as [string, string]),
    assumptions: [
      ['Cost multipliers (trees / industry / traffic)', `${a.costMultiplier.trees} / ${a.costMultiplier.industry} / ${a.costMultiplier.traffic}`],
      ['Tree canopy per mature tree', `${a.treeCanopyM2} m2`],
      ['Bag-filter capture', `${Math.round(a.bagFilterCapture * 100)}%`],
      ['Traffic reduction (standard / intensive)', `${Math.round(a.trafficReduction.standard * 100)}% / ${Math.round(a.trafficReduction.intensive * 100)}%`],
    ],
    costRows: costRows.map((r) => r.map(pdfSafe)),
    impact: [
      ['Mean PM2.5 in the target', `${i.baseline.toFixed(1)} -> ${i.predicted.toFixed(1)} ug/m3`],
      ['Change in the target', `${i.abs.toFixed(2)} ug/m3 (${i.pct.toFixed(1)}%)`],
      ['City mean PM2.5', `${i.cityBaseline.toFixed(1)} -> ${i.cityPredicted.toFixed(1)} ug/m3`],
      ['Zones improved by 0.5 ug/m3 or more', String(i.zonesImproved)],
      ['Zones affected', String(i.affectedZones)],
    ],
    limitations: limitations.map(pdfSafe),
    statuses: [
      'MODELED_SCENARIO: the PM2.5 effect comes from the uncalibrated prototype rule model on DEMO inputs. It is a hypothetical estimate, not a forecast or a measurement.',
      'Prices are planning inputs from the AeroMatrix price table (sourced or labelled estimates). They never touch environmental data.',
      `Generated ${generated.toISOString().slice(0, 10)}.`,
    ],
    sources: sources.map(pdfSafe),
  };
}

export function buildPlanPdf(outcome: PlanOutcome, plan: Plan, generated: Date = new Date()): jsPDF {
  const c = planPdfContent(outcome, plan, generated);
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 14;
  let y = 18;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(c.title, margin, y);
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text('Costed intervention plan for PM2.5 (MODELED_SCENARIO)', margin, y);
  doc.setTextColor(0);
  y += 4;

  const table = (head: string[][], body: string[][], opts: Record<string, unknown> = {}) => {
    autoTable(doc, { startY: y, head, body, margin: { left: margin, right: margin }, styles: { fontSize: 8, cellPadding: 1.6 }, headStyles: { fillColor: [163, 38, 63] }, ...opts });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  };
  const heading = (t: string) => {
    if (y > 270) {
      doc.addPage();
      y = 18;
    }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(t, margin, y);
    y += 2;
  };
  const paragraphs = (lines: string[]) => {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    for (const l of lines) {
      const wrapped = doc.splitTextToSize(`- ${l}`, 182) as string[];
      if (y + wrapped.length * 4 > 285) {
        doc.addPage();
        y = 18;
      }
      doc.text(wrapped, margin, y + 4);
      y += wrapped.length * 4 + 1;
    }
    y += 3;
  };

  heading('Summary');
  table([['Item', 'Value']], c.summary, { columnStyles: { 0: { cellWidth: 55, fontStyle: 'bold' } } });
  heading('Itemised costs');
  table([['Item', 'Category', 'Quantity', 'Unit price', 'Total', 'Status']], c.costRows, {
    columnStyles: { 0: { cellWidth: 62 }, 3: { halign: 'right' }, 4: { halign: 'right' } },
    foot: [['Total (one-time + first year)', '', '', '', pdfSafe(formatINRPdf(plan.total)), '']],
    footStyles: { fillColor: [240, 230, 215], textColor: 20 },
  });
  heading('Expected PM2.5 change (modeled)');
  table([['Measure', 'Value']], c.impact, { columnStyles: { 0: { cellWidth: 70, fontStyle: 'bold' } } });
  heading('Assumptions');
  table([['Assumption', 'Value']], c.assumptions, { columnStyles: { 0: { cellWidth: 80, fontStyle: 'bold' } } });
  heading('Limitations');
  paragraphs(c.limitations);
  heading('Data statuses');
  paragraphs(c.statuses);
  heading('Price sources');
  paragraphs(c.sources);
  return doc;
}

/** Build and download the PDF in the browser. */
export function downloadPlanPdf(outcome: PlanOutcome, plan: Plan): void {
  buildPlanPdf(outcome, plan).save(`aeromatrix-plan-${plan.id}.pdf`);
}
