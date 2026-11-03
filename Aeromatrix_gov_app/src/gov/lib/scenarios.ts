/** Saved Simulator scenarios: creation from an outcome, and CSV export. Every value is a Simulation result. */
import type { GovSavedScenario } from '../govStore';
import type { SimOutcome } from './measures';
import { csvEscape } from './format';
import { isNative, saveAndShare } from './native';

let counter = 0;

export function toSavedScenario(o: SimOutcome, name: string, now: Date = new Date()): GovSavedScenario | null {
  if (o.currentPm25 === null || o.projectedPm25 === null) return null;
  return {
    id: `gsc-${now.getTime().toString(36)}-${(counter++).toString(36)}`,
    name: name.trim() || `${o.zoneName}: ${o.measures.join(', ')}`,
    savedAt: now.toISOString(),
    target: { id: o.target.id, label: o.zoneName },
    measures: o.measures,
    weeks: o.weeks,
    baselinePm25: o.currentPm25,
    projectedPm25: o.projectedPm25,
    changePct: o.changePct,
    lowPct: o.lowPct,
    oneTime: o.oneTime,
    recurring: o.recurring,
    zonesImproved: o.zonesImproved,
    selection: o.selection,
  };
}

export const CSV_HEAD = [
  'Name',
  'Saved (UTC)',
  'Area',
  'Measures',
  'Weeks',
  'PM2.5 now (ug/m3, Estimated)',
  'PM2.5 simulated (ug/m3, Simulation)',
  'Change %',
  'Change % if only half the effect',
  'One-time cost (INR)',
  'First-year running cost (INR)',
  'Zones improved',
];

export function scenariosCsv(list: GovSavedScenario[]): string {
  const rows = list.map((s) =>
    [
      s.name,
      s.savedAt,
      s.target.label,
      s.measures.join('; '),
      s.weeks,
      s.baselinePm25.toFixed(1),
      s.projectedPm25.toFixed(1),
      s.changePct.toFixed(1),
      s.lowPct.toFixed(1),
      s.oneTime,
      s.recurring,
      s.zonesImproved,
    ].map(csvEscape),
  );
  const lines = [CSV_HEAD.map(csvEscape), ...rows].map((r) => r.join(','));
  return `${lines.join('\r\n')}\r\n# All values are Simulation results from a scenario model. The effect of dust control is not modelled.\r\n`;
}

export function downloadText(filename: string, text: string, mime = 'text/csv;charset=utf-8'): void {
  if (isNative()) {
    void saveAndShare(filename, new Blob([text], { type: mime }), filename);
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
