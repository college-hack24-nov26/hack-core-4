import { beforeAll, describe, expect, it } from 'vitest';
import type { BaseState } from '../types';
import { demoDataProvider } from '../data/demo/demoDataProvider';
import { DEFAULT_LIMITS, planProject } from './planEngine';
import { buildPlanPdf, pdfSafe, planPdfContent } from './planPdf';

let base: BaseState;
let outcome: ReturnType<typeof planProject>;
beforeAll(async () => {
  base = await demoDataProvider.getBaseState(10);
  outcome = planProject({ base, budget: 5_000_000, targetId: 'city', limits: DEFAULT_LIMITS, objective: 'pm25' });
});

describe('plan PDF', () => {
  it('writes the rupee amounts as "Rs" everywhere and never the unsupported sign', () => {
    const plan = outcome.plans[0];
    const c = planPdfContent(outcome, plan, new Date('2026-10-10T00:00:00Z'));
    const all = JSON.stringify(c);
    expect(all).not.toContain('₹');
    expect(all).toMatch(/Rs \d/);
    expect(c.summary.find(([k]) => k === 'Budget')![1]).toBe('Rs 50,00,000');
    expect(c.summary.find(([k]) => k === 'Total (one-time + first year)')![1]).toBe(`Rs ${plan.total.toLocaleString('en-IN')}`);
    // only plain printable ASCII ends up in the document
    expect(/[^\x20-\x7E\n"]/.test(all.replace(/\\n/g, ''))).toBe(false);
  });

  it('carries the summary, itemised costs with sources, impact, limitations and statuses', () => {
    const plan = outcome.plans[0];
    const c = planPdfContent(outcome, plan, new Date('2026-10-10T00:00:00Z'));
    expect(c.title).toBe('AeroMatrix Plan-It: Plan A');
    expect(c.costRows.some((r) => /Sourced/.test(r[5]))).toBe(true);
    expect(c.costRows.some((r) => /Estimate/.test(r[5]))).toBe(true);
    expect(c.sources.length).toBeGreaterThan(0);
    expect(c.sources.some((s) => /accessed 10 Oct 2026/.test(s))).toBe(true);
    expect(c.sources.some((s) => /^.*: ESTIMATE\./.test(s))).toBe(true);
    expect(c.impact[0][0]).toBe('Mean PM2.5 in the target');
    expect(c.limitations.length).toBeGreaterThan(0);
    expect(c.statuses.join(' ')).toMatch(/MODELED_SCENARIO/);
    expect(c.statuses.join(' ')).toMatch(/Generated 2026-10-10/);
  });

  it('produces a real multi-section PDF document', () => {
    const doc = buildPlanPdf(outcome, outcome.plans[0], new Date('2026-10-10T00:00:00Z'));
    const bytes = doc.output('arraybuffer');
    expect(bytes.byteLength).toBeGreaterThan(5000);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('substitutes characters the PDF fonts cannot draw', () => {
    expect(pdfSafe('₹12,000 – “quoted” … ×2 नमस्ते')).toBe('Rs 12,000 - "quoted" ... x2 ');
  });
});
