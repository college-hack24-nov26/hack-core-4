import type { BaseState } from '../types';
import { zoneLabel } from '../utils/zones';
import type { ActionEvaluation } from './actions';

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** One-line plain-language insight: what drives this action's result. */
export function actionInsight(base: BaseState, ev: ActionEvaluation, names: Record<string, string>): string {
  const r = ev.result;
  if (!ev.implementation.feasible || !r) return ev.implementation.note ?? 'Not applicable to the current city model.';
  const cellsById = new Map(base.cells.map((c) => [c.id, c]));
  const label = (id: string) => {
    const c = cellsById.get(id);
    return c ? zoneLabel(c, names) : id;
  };
  const entries = Object.entries(r.delta).map(([id, d]) => ({ id, d: d.pm25 }));
  const gains = entries.filter((e) => e.d < -0.05).sort((a, b) => a.d - b.d);
  const rises = entries.filter((e) => e.d > 0.05).sort((a, b) => b.d - a.d);
  const topGains = gains.slice(0, 3).map((e) => label(e.id));
  const total = gains.reduce((a, e) => a + -e.d, 0);
  const top3Share = total > 0 ? gains.slice(0, 3).reduce((a, e) => a + -e.d, 0) / total : 0;

  if (gains.length === 0 && rises.length === 0) return 'Little measurable change.';

  switch (ev.action.id) {
    case 'road-diversion': {
      const closed = base.roads.find((x) => x.id === ev.implementation.closedRoadId)?.name ?? 'the closed road';
      const target = base.roads.find((x) => x.id === ev.implementation.divertRoadId)?.name ?? 'the diversion road';
      const up = rises[0] ? ` while PM2.5 rises near ${label(rises[0].id)} (+${rises[0].d.toFixed(1)} ug/m3) on ${target}` : '';
      return `Benefit is concentrated along the ${closed} corridor (${joinNames(topGains)})${up}.`;
    }
    case 'industrial-relocation': {
      const up = rises[0] ? `, but the new site adds PM2.5 near ${label(rises[0].id)} (+${rises[0].d.toFixed(1)} ug/m3)` : '';
      return `Most of the benefit is downwind of the old site, around ${joinNames(topGains)}${up}.`;
    }
    case 'industrial-control':
      return `Most of the benefit is downwind of the largest emitters: ${joinNames(topGains)} (top 3 zones give ${Math.round(top3Share * 100)}% of the total reduction).`;
    case 'green-expansion':
      return `Benefit comes from added tree cover in built-up zones; the largest gains are in ${joinNames(topGains)}.`;
    case 'public-transport':
      return `Fewer and cleaner vehicles help most along busy corridors, led by ${joinNames(topGains)}.`;
    case 'traffic-restriction':
    default:
      return `Most of the benefit comes from ${joinNames(topGains)}: the top 3 zones give ${Math.round(top3Share * 100)}% of the total reduction.`;
  }
}
