/** Instruction texts. The app only prepares them; the Commissioner reads, edits and approves each one (D10). */
import { formatIst } from './format';
import type { GovAlert } from './alerts';
import type { Hotspot } from './hotspots';

export const NOT_SENT_NOTE = 'AeroMatrix does not send anything. Copy the text, or open an email or WhatsApp draft and send it yourself.';

export function composeAlertInstruction(a: GovAlert, deadline: string): string {
  const lines = [`Instruction from the Municipal Commissioner, Pune and Pimpri-Chinchwad`, '', `Subject: ${a.title}`, `Place: ${a.location}`];
  if (a.kind === 'current' && a.current !== null) {
    lines.push(`Situation: air quality is ${a.zone?.category ?? 'poor'} (CPCB AQI about ${Math.round(a.current)}${a.pollutant ? `, main pollutant ${a.pollutant}` : ''}). This is an ESTIMATE from Open-Meteo CAMS model data (about 40 km resolution), not an official station AQI.`);
  } else if (a.kind === 'forecast' && a.expected !== null) {
    lines.push(`Situation: the model forecast reaches CPCB AQI about ${Math.round(a.expected)} on ${a.forDate}${a.pollutant ? ` (main pollutant ${a.pollutant})` : ''}. This is a FORECAST from Open-Meteo CAMS model data, not a measurement.`);
  } else {
    lines.push(`Situation: ${a.reasons[0] ?? a.title}`);
  }
  if (a.kind !== 'data' && a.reasons.length > 0) lines.push(`Indications: ${a.reasons.slice(0, 2).join(' ')}`);
  lines.push('', `Action required: ${a.action}`, `Please report back by ${deadline}.`);
  return lines.join('\n');
}

export function composeHotspotTask(h: Hotspot, deadline: string): string {
  const lines = [`Inspection task from the Municipal Commissioner, Pune and Pimpri-Chinchwad`, '', `Place: ${h.name}`];
  if (h.aqi !== null) {
    lines.push(
      h.kind === 'zone'
        ? `Situation: CPCB AQI about ${Math.round(h.aqi)} (${h.category ?? 'unknown'}), an ESTIMATE from Open-Meteo CAMS model data, not an official station AQI.`
        : `Situation: last station reading AQI ${Math.round(h.aqi)} (${h.category ?? 'unknown'}) on ${formatIst(h.asOf)}${h.outdated ? ', which is OUTDATED' : ''}.`,
    );
  }
  const causes = h.causes.map((c) => `${c.label} (${c.strength.toLowerCase()} indication)`);
  lines.push(causes.length > 0 ? `Possible causes to inspect: ${causes.join('; ')}.` : 'No likely cause could be shown with evidence; please inspect on site.');
  lines.push('Not assessed (no data connected): construction sites, RMC plants, waste burning, brick kilns. Please check these on site.');
  lines.push('', `Please complete the inspection and report findings by ${deadline}.`);
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
