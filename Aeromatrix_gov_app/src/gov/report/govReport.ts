/**
 * Draws the Commissioner's intervention report as a PDF (jsPDF + jspdf-autotable) from reportContent. The Inter font
 * is embedded so rupee amounts and units print correctly. Charts are drawn with plain shapes: pie charts only when a
 * source-apportionment study exists, bar charts for levels and costs, and an explicit box when a chart has no data.
 */
import { toFraction } from '../lib/network';
import { jsPDF } from 'jspdf';
import * as autoTableModule from 'jspdf-autotable';
import type { Block, ChartSpec, ReportContent, ReportInput } from './reportContent';
import { reportContent } from './reportContent';

export { reportContent };
export type { ReportInput, ReportContent };

export interface ReportFonts {
  /** base64 of Inter-Regular.ttf */
  regular: string;
  /** base64 of Inter-Bold.ttf */
  bold: string;
}

type AutoTableFn = (doc: jsPDF, options: Record<string, unknown>) => void;

/**
 * jspdf-autotable ships both a default and a named export, and the browser bundler can wrap the CommonJS default one
 * level deeper than Node does. Take whichever of them is the function.
 */
function resolveAutoTable(): AutoTableFn {
  const m = autoTableModule as unknown as Record<string, unknown>;
  const d = m.default as Record<string, unknown> | AutoTableFn | undefined;
  const found = [m.default, m.autoTable, typeof d === 'object' ? d?.default : undefined, typeof d === 'object' ? d?.autoTable : undefined].find((f) => typeof f === 'function');
  if (!found) throw new Error('The PDF table library could not be loaded.');
  return found as AutoTableFn;
}

const ACCENT: [number, number, number] = [163, 38, 63];
const INK: [number, number, number] = [42, 15, 23];
const MUTED: [number, number, number] = [110, 74, 79];
const LINE: [number, number, number] = [220, 205, 188];
const PAPER: [number, number, number] = [251, 246, 236];
const M = 16; // page margin, mm
const W = 210;
const CONTENT_W = W - 2 * M;
const BOTTOM = 276;

const hex = (c: string): [number, number, number] => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];

/** Characters Inter has no good glyph for are mapped to plain equivalents. */
export function pdfText(s: string): string {
  return s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/…/g, '...')
    .replace(/[₂]/g, '2')
    .replace(/[₃]/g, '3')
    .replace(/ /g, ' ');
}

export function reportFileName(input: Pick<ReportInput, 'zone' | 'generated'>): string {
  const slug = input.zone.place.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'area';
  return `aeromatrix-report-${slug}-${input.generated.toISOString().slice(0, 10)}.pdf`;
}

let LOGO: string | null = null;

function drawMark(doc: jsPDF, x: number, y: number, size: number) {
  if (LOGO) {
    doc.setFillColor(252, 241, 230);
    doc.roundedRect(x, y, size, size, size * 0.22, size * 0.22, 'F');
    doc.addImage(LOGO, 'PNG', x + size * 0.06, y + size * 0.06, size * 0.88, size * 0.88);
    return;
  }
  const k = size / 64;
  doc.setFillColor(...ACCENT);
  doc.circle(x + 32 * k, y + 32 * k, 30 * k, 'F');
  doc.setDrawColor(251, 245, 233);
  doc.setLineWidth(2.5 * k);
  doc.circle(x + 32 * k, y + 32 * k, 22 * k, 'S');
  doc.setLineWidth(4 * k);
  doc.lines(
    [
      [6 * k, -12 * k, 12 * k, -12 * k, 18 * k, 0],
      [6 * k, 12 * k, 12 * k, 12 * k, 18 * k, 0],
    ],
    x + 14 * k,
    y + 36 * k,
    [1, 1],
    'S',
    false,
  );
  doc.setFillColor(251, 245, 233);
  doc.circle(x + 32 * k, y + 22 * k, 3.2 * k, 'F');
  doc.setDrawColor(0);
  doc.setLineWidth(0.2);
}

class Writer {
  y = 0;
  constructor(
    readonly doc: jsPDF,
    private readonly autoTable: AutoTableFn,
  ) {}

  font(weight: 'normal' | 'bold', size: number, color: [number, number, number] = INK) {
    this.doc.setFont('Inter', weight);
    this.doc.setFontSize(size);
    this.doc.setTextColor(...color);
  }

  ensure(h: number) {
    if (this.y + h > BOTTOM) {
      this.doc.addPage();
      this.y = 22;
    }
  }

  gap(mm: number) {
    this.y += mm;
  }

  text(t: string, opts: { weight?: 'normal' | 'bold'; size?: number; color?: [number, number, number]; indent?: number; width?: number; lead?: number } = {}) {
    const size = opts.size ?? 9.5;
    this.font(opts.weight ?? 'normal', size, opts.color ?? INK);
    const width = (opts.width ?? CONTENT_W) - (opts.indent ?? 0);
    const lines = this.doc.splitTextToSize(pdfText(t), width) as string[];
    const lead = opts.lead ?? size * 0.46;
    this.ensure(lines.length * lead + 1);
    this.doc.text(lines, M + (opts.indent ?? 0), this.y + size * 0.35);
    this.y += lines.length * lead + 1;
  }

  heading(t: string, level: 1 | 2, need = 14) {
    if (level === 1) {
      this.ensure(22);
      this.gap(5);
      this.doc.setFillColor(...ACCENT);
      this.doc.rect(M, this.y, 1.6, 7, 'F');
      this.font('bold', 14, ACCENT);
      this.doc.text(pdfText(t), M + 4.5, this.y + 5.4);
      this.y += 11;
    } else {
      this.ensure(need);
      this.gap(2);
      this.font('bold', 10.5, INK);
      this.doc.text(pdfText(t), M, this.y + 4);
      this.y += 7;
    }
  }

  list(items: string[]) {
    for (const it of items) {
      this.font('normal', 9.5);
      const lines = this.doc.splitTextToSize(pdfText(it), CONTENT_W - 5) as string[];
      this.ensure(lines.length * 4.4 + 1);
      this.doc.setFillColor(...ACCENT);
      this.doc.circle(M + 1.2, this.y + 2.3, 0.7, 'F');
      this.doc.text(lines, M + 5, this.y + 3.3);
      this.y += lines.length * 4.4 + 1.2;
    }
    this.gap(1.5);
  }

  note(t: string) {
    this.font('normal', 8.5, MUTED);
    const lines = this.doc.splitTextToSize(pdfText(t), CONTENT_W - 8) as string[];
    const h = lines.length * 4 + 5;
    this.ensure(h + 2);
    this.doc.setFillColor(...PAPER);
    this.doc.setDrawColor(...LINE);
    this.doc.roundedRect(M, this.y, CONTENT_W, h, 1.5, 1.5, 'FD');
    this.doc.text(lines, M + 4, this.y + 5);
    this.y += h + 3;
  }

  table(head: string[], body: string[][], foot?: string[], kv = false) {
    this.ensure(20);
    const headless = head.every((h) => h === '');
    this.autoTable(this.doc, {
      startY: this.y,
      head: headless ? undefined : [head.map(pdfText)],
      body: body.map((r) => r.map(pdfText)),
      foot: foot ? [foot.map(pdfText)] : undefined,
      showFoot: 'lastPage',
      margin: { left: M, right: M, top: 22, bottom: 20 },
      theme: 'plain',
      styles: { font: 'Inter', fontSize: 8.8, cellPadding: { top: 2.2, bottom: 2.2, left: 2.6, right: 2.6 }, textColor: INK, lineColor: LINE, lineWidth: { bottom: 0.2 }, overflow: 'linebreak' },
      headStyles: { fillColor: ACCENT, textColor: [255, 255, 255], fontStyle: 'bold', lineWidth: 0 },
      footStyles: { fillColor: PAPER, textColor: INK, fontStyle: 'bold', lineWidth: 0 },
      alternateRowStyles: { fillColor: [253, 250, 244] },
      columnStyles: kv || headless ? { 0: { fontStyle: 'bold', cellWidth: 40, textColor: MUTED } } : {},
    });
    this.y = (this.doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 4;
  }

  // ---- charts ----

  private frame(x: number, w: number, h: number, title: string) {
    this.doc.setDrawColor(...LINE);
    this.doc.setFillColor(255, 255, 255);
    this.doc.roundedRect(x, this.y, w, h, 2, 2, 'FD');
    this.font('bold', 9.5, INK);
    this.doc.text(pdfText(title), x + 4, this.y + 6);
  }

  chart(spec: ChartSpec, x: number, w: number, h: number) {
    this.frame(x, w, h, spec.title);
    const top = this.y;
    if (spec.kind === 'none') {
      this.font('normal', 8.8, MUTED);
      const lines = this.doc.splitTextToSize(pdfText(spec.message), w - 12) as string[];
      this.doc.setDrawColor(...LINE);
      this.doc.setLineDashPattern([1.5, 1.5], 0);
      this.doc.roundedRect(x + 4, top + 11, w - 8, h - 16, 1.5, 1.5, 'S');
      this.doc.setLineDashPattern([], 0);
      this.doc.text(lines, x + 8, top + h / 2 - (lines.length * 4) / 2 + 3);
      return;
    }
    if (spec.kind === 'pie') {
      const r = Math.min(20, (h - 30) / 2);
      const cx = x + 4 + r + 2;
      const cy = top + 12 + r;
      let a0 = -Math.PI / 2;
      for (const s of spec.slices) {
        const a1 = a0 + (s.percent / 100) * 2 * Math.PI;
        this.doc.setFillColor(...hex(s.color));
        this.doc.setDrawColor(255, 255, 255);
        this.doc.setLineWidth(0.5);
        if (s.percent >= 99.9) this.doc.circle(cx, cy, r, 'FD');
        else {
          const steps = Math.max(2, Math.ceil((a1 - a0) / (Math.PI / 36)));
          const pts: Array<[number, number]> = [[cx, cy]];
          for (let i = 0; i <= steps; i++) {
            const a = a0 + ((a1 - a0) * i) / steps;
            pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
          }
          const rel: number[][] = [];
          for (let i = 1; i < pts.length; i++) rel.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
          this.doc.lines(rel, pts[0][0], pts[0][1], [1, 1], 'FD', true);
        }
        a0 = a1;
      }
      this.doc.setLineWidth(0.2);
      // legend
      const lx = cx + r + 6;
      let ly = top + 13;
      this.font('normal', 8.6, INK);
      for (const s of spec.slices) {
        this.doc.setFillColor(...hex(s.color));
        this.doc.rect(lx, ly - 2.6, 3, 3, 'F');
        this.doc.text(pdfText(`${s.label}  ${s.percent.toFixed(0)}%`), lx + 5, ly);
        ly += 5;
      }
      this.font('normal', 7.6, MUTED);
      const cap = this.doc.splitTextToSize(pdfText(spec.caption), w - 8) as string[];
      this.doc.text(cap.slice(0, 3), x + 4, top + h - 7 - (Math.min(3, cap.length) - 1) * 3.2);
      return;
    }
    // bars
    const left = x + 6;
    const bw = w - 12;
    const plotTop = top + 17;
    const base = top + h - 18;
    const max = Math.max(...spec.bars.map((b) => b.value), 1) * 1.12;
    const n = Math.max(1, spec.bars.length);
    const slot = bw / n;
    const barW = Math.min(slot * 0.62, 16);
    this.doc.setDrawColor(...LINE);
    this.doc.line(left, base, left + bw, base);
    spec.bars.forEach((b, i) => {
      const bh = Math.max(0.4, ((base - plotTop) * b.value) / max);
      const bx = left + slot * i + (slot - barW) / 2;
      this.doc.setFillColor(...hex(b.color));
      this.doc.roundedRect(bx, base - bh, barW, bh, 0.8, 0.8, 'F');
      this.font('bold', 7.8, INK);
      const val = spec.unit === '₹' ? `₹${Math.round(b.value).toLocaleString('en-IN')}` : b.value.toFixed(spec.decimals);
      this.doc.text(pdfText(val), bx + barW / 2, base - bh - 1.3, { align: 'center' });
      this.font('normal', 7.4, MUTED);
      const lab = this.doc.splitTextToSize(pdfText(b.label), slot - 1) as string[];
      this.doc.text(lab.slice(0, 2), bx + barW / 2, base + 3.6, { align: 'center' });
    });
    this.font('normal', 7.6, MUTED);
    this.doc.text(pdfText(`Unit: ${spec.unit}`), left, top + h - 3.2);
    const cap = this.doc.splitTextToSize(pdfText(spec.caption), bw - 26) as string[];
    this.doc.text(cap.slice(0, 2), left + 22, top + h - 3.2 - (Math.min(2, cap.length) - 1) * 3);
  }

  /** The device network on a satellite picture: devices D1..Dn linked to the nearest official centre, then to the AeroMatrix model. */
  network(b: Extract<Block, { t: 'network' }>) {
    const { plan, image, logo } = b;
    const w = CONTENT_W;
    const h = (w * plan.px.h) / plan.px.w;
    this.ensure(h + 4);
    const x0 = M;
    const y0 = this.y;
    const doc = this.doc;
    if (image) {
      doc.addImage(image, 'JPEG', x0, y0, w, h);
    } else {
      doc.setFillColor(232, 236, 232);
      doc.rect(x0, y0, w, h, 'F');
      this.font('normal', 9, MUTED);
      doc.text('Satellite picture unavailable', x0 + w / 2, y0 + 6, { align: 'center' });
    }
    doc.setDrawColor(...LINE);
    doc.rect(x0, y0, w, h, 'S');
    const P = (lon: number, lat: number): [number, number] => {
      const [fx, fy] = toFraction(plan, lon, lat);
      return [x0 + fx * w, y0 + fy * h];
    };
    const label = (text: string, cx: number, cy: number, bold = true) => {
      this.font(bold ? 'bold' : 'normal', 8, [60, 20, 30]);
      const tw = doc.getTextWidth(pdfText(text)) + 3.6;
      doc.setFillColor(255, 255, 255);
      doc.roundedRect(cx - tw / 2, cy - 3.2, tw, 5.4, 1.6, 1.6, 'F');
      doc.text(pdfText(text), cx, cy + 0.6, { align: 'center' });
    };
    const arrow = (ax: number, ay: number, bx: number, by: number, dashed: boolean) => {
      doc.setDrawColor(...ACCENT);
      doc.setLineWidth(0.55);
      if (dashed) doc.setLineDashPattern([2, 1.5], 0);
      doc.line(ax, ay, bx, by);
      doc.setLineDashPattern([], 0);
      const ang = Math.atan2(by - ay, bx - ax);
      const s = 2.4;
      doc.setFillColor(...ACCENT);
      doc.triangle(bx, by, bx - s * Math.cos(ang - 0.45), by - s * Math.sin(ang - 0.45), bx - s * Math.cos(ang + 0.45), by - s * Math.sin(ang + 0.45), 'F');
      doc.setLineWidth(0.2);
    };

    // the AeroMatrix model box (bottom right)
    const bw = 46;
    const bh = 17;
    const bx = x0 + w - bw - 4;
    const by = y0 + h - bh - 4;
    const hubPt = plan.hub ? P(plan.hub.lon, plan.hub.lat) : null;
    const areaPt = P(plan.area.lon, plan.area.lat);
    const devPts = plan.devices.map((d) => ({ id: d.id, p: P(d.lon, d.lat) }));
    // devices -> hub (or straight to the model when there is no hub)
    for (const d of devPts) {
      if (hubPt) arrow(d.p[0], d.p[1], hubPt[0], hubPt[1], true);
      else arrow(d.p[0], d.p[1], bx, by + bh / 2, true);
    }
    if (hubPt) arrow(hubPt[0], hubPt[1], bx, by + bh / 2, false);

    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(0.5);
    doc.roundedRect(bx, by, bw, bh, 2, 2, 'FD');
    doc.setLineWidth(0.2);
    if (logo) doc.addImage(logo, 'PNG', bx + 2.5, by + 2, 13, 13);
    this.font('bold', 8.6, ACCENT);
    doc.text('AeroMatrix Brain', bx + (logo ? 17 : 4), by + bh / 2 + 1.2);

    // the official centre
    if (hubPt && plan.hub) {
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...ACCENT);
      doc.setLineWidth(0.8);
      doc.roundedRect(hubPt[0] - 3.2, hubPt[1] - 3.2, 6.4, 6.4, 1.2, 1.2, 'FD');
      doc.setLineWidth(0.2);
      this.font('bold', 6.5, ACCENT);
      doc.text(plan.hub.kind === 'namp' ? 'M' : 'C', hubPt[0], hubPt[1] + 1.2, { align: 'center' });
      label(`${plan.hub.kind === 'namp' ? 'Manual monitoring centre (NAMP)' : 'Continuous station (CAAQMS)'}`, hubPt[0], hubPt[1] + 8.4);
      label(plan.hub.name, hubPt[0], hubPt[1] - 7.2, false);
    }
    // the area
    label(plan.area.name, areaPt[0], areaPt[1] - 13, false);
    // devices
    for (const d of devPts) {
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(...ACCENT);
      doc.setLineWidth(0.8);
      doc.circle(d.p[0], d.p[1], 3.1, 'FD');
      doc.setLineWidth(0.2);
      this.font('bold', 7, ACCENT);
      doc.text(d.id, d.p[0], d.p[1] + 1.1, { align: 'center' });
    }
    this.y += h + 4;
  }

  charts(specs: ChartSpec[]) {
    const h = 62;
    this.ensure(h + 4);
    if (specs.length === 1) {
      this.chart(specs[0], M, CONTENT_W, h);
    } else {
      const w = (CONTENT_W - 4) / 2;
      specs.forEach((s, i) => this.chart(s, M + i * (w + 4), w, h));
    }
    this.y += h + 4;
  }
}

/** Space a heading needs below it so it never sits alone at the bottom of a page. */
function needAfter(next: Block | undefined): number {
  if (!next) return 14;
  return next.t === 'network' ? 112 : next.t === 'charts' ? 72 : next.t === 'table' ? 46 : next.t === 'list' ? 30 : 24;
}

function drawBlock(wr: Writer, b: Block, next?: Block) {
  const need = needAfter(next);
  switch (b.t) {
    case 'p':
      wr.text(b.text);
      wr.gap(1);
      break;
    case 'h':
      wr.heading(b.text, 2, need);
      break;
    case 'list':
      wr.list(b.items);
      break;
    case 'note':
      wr.note(b.text);
      break;
    case 'table':
      wr.table(b.head, b.body, b.foot, b.head.length === 2 && b.head[0] === '');
      break;
    case 'charts':
      wr.charts(b.specs);
      break;
    case 'network':
      wr.network(b);
      break;
  }
}

export function buildReportPdf(input: ReportInput, fonts: ReportFonts): jsPDF {
  const c = reportContent(input);
  LOGO = input.logo ?? null;
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  doc.addFileToVFS('Inter-Regular.ttf', fonts.regular);
  doc.addFont('Inter-Regular.ttf', 'Inter', 'normal', undefined, 'Identity-H');
  doc.addFileToVFS('Inter-Bold.ttf', fonts.bold);
  doc.addFont('Inter-Bold.ttf', 'Inter', 'bold', undefined, 'Identity-H');
  const wr = new Writer(doc, resolveAutoTable());

  // ---- cover block ----
  doc.setFillColor(...ACCENT);
  doc.rect(0, 0, W, 38, 'F');
  drawMark(doc, M, 9, 20);
  wr.font('bold', 19, [255, 255, 255]);
  doc.text(pdfText(c.title), M + 26, 20, { maxWidth: CONTENT_W - 26 });
  wr.font('normal', 10, [251, 235, 238]);
  doc.text(pdfText(`${c.subtitle}  |  ${c.generatedText}`), M + 26, 28);
  wr.y = 46;
  wr.table(['', ''], c.meta.map((m) => [m[0], m[1]]), undefined, true);
  wr.gap(1);

  for (const s of c.sections) {
    wr.heading(`${s.id}. ${s.title}`, 1);
    s.blocks.forEach((b, i) => drawBlock(wr, b, s.blocks[i + 1]));
  }
  wr.heading(c.appendix.title, 1);
  c.appendix.blocks.forEach((b, i) => drawBlock(wr, b, c.appendix.blocks[i + 1]));

  // ---- running header and footer ----
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    if (i > 1) {
      drawMark(doc, M, 7.5, 6.5);
      wr.font('bold', 8.5, ACCENT);
      doc.text('AeroMatrix', M + 8.5, 12);
      wr.font('normal', 8.5, MUTED);
      doc.text(pdfText(c.title), W - M, 12, { align: 'right' });
      doc.setDrawColor(...LINE);
      doc.line(M, 16, W - M, 16);
    }
    doc.setDrawColor(...LINE);
    doc.line(M, 284, W - M, 284);
    wr.font('normal', 7.8, MUTED);
    doc.text(pdfText(`${c.generatedText}. Estimated, Forecast and Simulation values are model results.`), M, 289);
    doc.text(`Page ${i} of ${pages}`, W - M, 289, { align: 'right' });
  }
  return doc;
}
