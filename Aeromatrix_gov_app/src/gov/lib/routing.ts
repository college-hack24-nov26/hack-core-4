/**
 * Which department to inform. These are SUGGESTIONS: the Commissioner chooses the recipient and approves every
 * instruction. Nothing here sends anything (D10).
 */
export type CauseKey = 'traffic' | 'industry' | 'dust' | 'station' | 'general';

export interface Department {
  key: string;
  name: string;
}

export const DEPARTMENTS: Record<string, Department> = {
  construction: { key: 'construction', name: 'Construction and environmental enforcement cell' },
  industry: { key: 'industry', name: 'Industrial pollution-control authority (MPCB regional office)' },
  roads: { key: 'roads', name: 'Road maintenance and municipal operations' },
  traffic: { key: 'traffic', name: 'Traffic police and traffic planning cell' },
  swm: { key: 'swm', name: 'Solid waste management department' },
  monitoring: { key: 'monitoring', name: 'Monitoring network operators (MPCB / IITM)' },
  garden: { key: 'garden', name: 'Garden and tree authority' },
  health: { key: 'health', name: 'Health department' },
};

export function departmentsFor(cause: CauseKey): Department[] {
  switch (cause) {
    case 'dust':
      return [DEPARTMENTS.construction, DEPARTMENTS.roads];
    case 'industry':
      return [DEPARTMENTS.industry];
    case 'traffic':
      return [DEPARTMENTS.traffic];
    case 'station':
      return [DEPARTMENTS.monitoring];
    default:
      return [DEPARTMENTS.health];
  }
}

/** A one-line corrective action naming the place. */
export function actionFor(cause: CauseKey, place: string, detail?: string): string {
  const tail = detail ? ` ${detail}` : '';
  switch (cause) {
    case 'dust':
      return `Inspect construction sites and arrange water sprinkling and dust suppression on the main roads in ${place}.${tail}`;
    case 'industry':
      return `Inspect mapped industrial units near ${place} for emission-control compliance and report findings.${tail}`;
    case 'traffic':
      return `Review traffic management and enforcement on the busiest roads in ${place}.${tail}`;
    case 'station':
      return `Restore the data feed of the monitoring stations serving ${place} and confirm the readings.${tail}`;
    default:
      return `Prepare a public health advisory for ${place} and review the likely causes.${tail}`;
  }
}

export const CAUSE_LABEL: Record<CauseKey, string> = {
  traffic: 'Road traffic',
  industry: 'Industry',
  dust: 'Road and construction dust',
  station: 'Monitoring network',
  general: 'General',
};

// ---- ready-to-send drafts (opened only when the Commissioner clicks; the app never sends) ----

export function mailtoLink(to: string, subject: string, body: string): string {
  const recipient = /@/.test(to) ? to.trim() : '';
  return `mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** wa.me with a prefilled message and no number: the Commissioner picks the contact in WhatsApp. */
export function whatsappLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
