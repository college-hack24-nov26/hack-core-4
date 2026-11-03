/** Instruction texts. The app only prepares them; the Commissioner reads, edits and approves each one. */
import { formatIst } from './format';
import type { GovAlert } from './alerts';
import type { Hotspot } from './hotspots';

export const NOT_SENT_NOTE = 'Nothing is sent automatically. Copy the text or open a draft to send it yourself.';

export function composeAlertInstruction(a: GovAlert, deadline: string): string {
  const lines = ['Instruction from the Municipal Commissioner, Pune and Pimpri-Chinchwad', '', `Subject: ${a.title}`, `Place: ${a.location}`];
  if (a.kind === 'current') {
    lines.push(`Situation: ${a.currentDetail} (${a.zone?.category ?? 'Poor'}). Estimated from model data, not an official station reading.`);
  } else if (a.kind === 'forecast') {
    lines.push(`Situation: forecast to reach ${a.expectedDetail ?? 'a Poor level'} on ${a.forDate}. This is a forecast, not a measurement.`);
  } else {
    lines.push(`Situation: ${a.reasons[0] ?? a.title}.`);
  }
  if (a.kind !== 'data' && a.reasons.length > 1) {
    const m = /^(.*): (Strong|Moderate|Weak) indication$/.exec(a.reasons[0]);
    lines.push(`Likely cause: ${m ? `${m[1]} (${m[2].toLowerCase()} indication)` : a.reasons[0]}. ${a.reasons[1]}.`);
  }
  lines.push('', `Action required: ${a.action}`, `Please report back by ${deadline}.`);
  return lines.join('\n');
}

export function composeHotspotTask(h: Hotspot, deadline: string): string {
  const lines = ['Inspection task from the Municipal Commissioner, Pune and Pimpri-Chinchwad', '', `Place: ${h.name}`];
  if (h.aqi !== null) {
    lines.push(
      h.kind === 'zone'
        ? `Situation: AQI about ${Math.round(h.aqi)} (${h.category ?? 'unknown'}), estimated from model data, not an official station reading.`
        : `Situation: last station reading AQI ${Math.round(h.aqi)} (${h.category ?? 'unknown'}) on ${formatIst(h.asOf)}${h.outdated ? ', which is outdated' : ''}.`,
    );
  }
  const causes = h.causes.map((c) => `${c.label.toLowerCase()} (${c.strength.toLowerCase()} indication)`);
  lines.push(causes.length > 0 ? `Possible causes to check: ${causes.join('; ')}.` : 'No likely cause is supported by the available data; please inspect on site, including construction sites, RMC plants and waste burning.');
  lines.push('', `Please complete the inspection and report your findings by ${deadline}.`);
  return lines.join('\n');
}

/** Copy to the clipboard, falling back to a hidden textarea when the async API is unavailable. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}
