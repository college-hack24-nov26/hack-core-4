/**
 * Alerts. An alert exists ONLY when a configured threshold is crossed by real data: the current model value or a
 * forecast day of a zone reaching Poor or worse, or stale station feeds. Ids are stable so the Commissioner's
 * workflow records (acknowledged, assigned, resolved) persist across refreshes and reloads.
 */
import { useEffect, useMemo } from 'react';
import type { LonLat } from '../../types';
import { useGovStore, type AlertRecord } from '../govStore';
import { CATEGORY_FLOOR, POLLUTANT_NAME, POLLUTANT_UNIT, categoryRank, groupByGrid, useAirData, type AqiCategory, type CauseEvidence, type ForecastDay, type PollutantKey, type Strength, type ZoneRow } from './airdata';
import { countStations, nearestStations, useStations, type StationBuild, type StationRow } from './stations';
import { actionFor, departmentsFor, type CauseKey, type Department } from './routing';
import { addDaysIst } from './format';

export type AlertSeverity = 'critical' | 'high' | 'watch' | 'info';
export type AlertKind = 'forecast' | 'current' | 'data';

export const SEVERITY_LABEL: Record<AlertSeverity, string> = { critical: 'Critical', high: 'High', watch: 'Watch', info: 'Info' };
export const SEVERITY_ORDER: Record<AlertSeverity, number> = { critical: 0, high: 1, watch: 2, info: 3 };

/** The configured threshold: Poor (CPCB AQI 201) or worse. */
export const ALERT_THRESHOLD: AqiCategory = 'Poor';
export const ALERT_THRESHOLD_AQI = CATEGORY_FLOOR[ALERT_THRESHOLD];

export const CONFIDENCE_TEXT = 'Not quantified: model data has no published error band for this location';

const DEADLINE_DAYS: Record<AlertSeverity, number> = { critical: 1, high: 2, watch: 5, info: 7 };

export interface GovAlert {
  id: string;
  kind: AlertKind;
  severity: AlertSeverity;
  title: string;
  pollutant: string | null;
  location: string;
  locationLonLat: LonLat | null;
  zoneId: string | null;
  /** the pollutant or condition the alert is about */
  condition: string;
  /** AQI now (estimate) */
  current: number | null;
  /** the current reading in words, e.g. "AQI 230 Â· PM2.5 112 Âµg/mÂ³" */
  currentDetail: string;
  /** the expected reading in words, for forecast alerts */
  expectedDetail: string | null;
  /** AQI expected on forDate (forecast alerts) */
  expected: number | null;
  threshold: number;
  forDate: string | null;
  confidence: string;
  reasons: string[];
  action: string;
  causeKey: CauseKey;
  departments: Department[];
  /** suggested deadline, YYYY-MM-DD */
  deadline: string;
  zone: ZoneRow | null;
  /** monitoring stations nearest to the place */
  stations: StationRow[];
  record: AlertRecord;
}

const STRENGTH_RANK: Record<Strength, number> = { Strong: 0, Moderate: 1, Weak: 2 };

export function topCause(causes: CauseEvidence[]): CauseEvidence | null {
  if (causes.length === 0) return null;
  return [...causes].sort((a, b) => STRENGTH_RANK[a.strength] - STRENGTH_RANK[b.strength])[0];
}

const NO_EVIDENCE = 'No likely cause is supported by the available data.';

const severityOf = (c: AqiCategory): AlertSeverity => (categoryRank(c) >= categoryRank('Very Poor') ? 'critical' : 'high');

const dominantLabel = (d: string | null): string | null => (d ? d.toUpperCase().replace('PM25', 'PM2.5') : null);

function placeText(z: ZoneRow, sharing: number): string {
  return sharing > 0 ? `${z.place} and ${sharing} nearby area${sharing === 1 ? '' : 's'}` : z.place;
}

/** "AQI 230 Â· PM2.5 112 Âµg/mÂ³" for the main pollutant of an area. */
function readingText(z: ZoneRow): string {
  const key = (z.dominant ?? '') as PollutantKey;
  const v = z.values[key];
  return v === undefined ? `AQI ${z.aqi}` : `AQI ${z.aqi} Â· ${POLLUTANT_NAME[key]} ${v < 10 ? v.toFixed(1) : Math.round(v)} ${POLLUTANT_UNIT[key]}`;
}

export interface AlertInputs {
  zones: ZoneRow[];
  stations: StationBuild;
  records: Record<string, AlertRecord>;
  nowMs: number;
}

export function buildAlerts({ zones, stations, records, nowMs }: AlertInputs): GovAlert[] {
  const out: GovAlert[] = [];
  const rec = (id: string): AlertRecord => records[id] ?? { status: 'new', firstSeen: nowMs };

  for (const { zone, sharing } of groupByGrid(zones)) {
    const place = placeText(zone, sharing);
    const cause = topCause(zone.causes);
    const causeKey: CauseKey = cause?.key ?? 'general';
    const reasons = cause ? [`${cause.label}: ${cause.strength} indication`, ...cause.evidence] : [NO_EVIDENCE];
    const near = nearestStations(stations.placed, zone.location, 3, 10).map((x) => x.station);
    const base = {
      pollutant: dominantLabel(zone.dominant),
      condition: dominantLabel(zone.dominant) ?? 'Air quality',
      location: place,
      locationLonLat: zone.location,
      zoneId: zone.id,
      threshold: ALERT_THRESHOLD_AQI,
      confidence: CONFIDENCE_TEXT,
      reasons,
      action: actionFor(causeKey, zone.place),
      causeKey,
      departments: departmentsFor(causeKey),
      zone,
      stations: near,
    };

    if (categoryRank(zone.category) >= categoryRank(ALERT_THRESHOLD)) {
      const id = `current:${zone.gridKey}`;
      const severity = severityOf(zone.category);
      out.push({
        ...base,
        id,
        kind: 'current',
        severity,
        title: `${zone.category} air in ${zone.place}`,
        current: zone.aqi,
        currentDetail: readingText(zone),
        expected: null,
        expectedDetail: null,
        forDate: null,
        deadline: addDaysIst(nowMs, DEADLINE_DAYS[severity]),
        record: rec(id),
      });
      continue;
    }

    const crossing = zone.forecast.filter((f) => categoryRank(f.category) >= categoryRank(ALERT_THRESHOLD));
    if (crossing.length > 0) {
      const first: ForecastDay = crossing[0];
      const worst = crossing.reduce((a, b) => (b.aqi > a.aqi ? b : a));
      let severity = severityOf(worst.category);
      if (first.hours === 72) severity = 'watch';
      const id = `forecast:${zone.gridKey}:${first.date}`;
      out.push({
        ...base,
        id,
        kind: 'forecast',
        severity,
        title: `${worst.category} air expected in ${zone.place} by ${first.date}`,
        current: zone.aqi,
        currentDetail: readingText(zone),
        expected: worst.aqi,
        expectedDetail: `AQI ${worst.aqi}${worst.pm25 !== null ? ` Â· PM2.5 ${Math.round(worst.pm25)} Âµg/mÂ³` : ''}`,
        forDate: first.date,
        deadline: addDaysIst(nowMs, DEADLINE_DAYS[severity]),
        record: rec(id),
      });
    }
  }

  // Stale station feeds.
  const c = countStations(stations);
  const withReading = c.live + c.outdated;
  if (withReading > 0 && c.outdated > 0) {
    const id = 'data:stale-feeds';
    const none = c.live === 0;
    out.push({
      id,
      kind: 'data',
      severity: 'watch',
      title: none ? 'No monitoring station has a current reading' : `${c.outdated} of ${withReading} monitoring stations have no current reading`,
      pollutant: null,
      condition: 'Station readings',
      location: 'Monitoring network',
      locationLonLat: null,
      zoneId: null,
      current: null,
      currentDetail: `${c.outdated} of ${withReading} stations outdated`,
      expected: null,
      expectedDetail: null,
      threshold: 0,
      forDate: null,
      confidence: "Based on the time of each station's latest reading.",
      reasons: [
        `${c.outdated} station${c.outdated === 1 ? '' : 's'} last reported more than 3 hours ago`,
        'Stations without a current reading do not give monitoring coverage.',
      ],
      action: actionFor('station', 'the city'),
      causeKey: 'station',
      departments: departmentsFor('station'),
      deadline: addDaysIst(nowMs, DEADLINE_DAYS.watch),
      zone: null,
      stations: stations.placed.filter((s) => s.status === 'outdated').slice(0, 5),
      record: rec(id),
    });
  }
  if (stations.modelService.status === 'offline') {
    const id = 'data:model-offline';
    out.push({
      id,
      kind: 'data',
      severity: 'info',
      title: 'Station readings are unavailable',
      pollutant: null,
      condition: 'Station readings',
      location: 'Monitoring network',
      locationLonLat: null,
      zoneId: null,
      current: null,
      currentDetail: 'Station service not responding',
      expected: null,
      expectedDetail: null,
      threshold: 0,
      forDate: null,
      confidence: 'The station data service did not respond.',
      reasons: ['No station readings could be retrieved.', 'City and area values are still estimated from model data.'],
      action: 'Ask the monitoring team to restore the station data connection.',
      causeKey: 'station',
      departments: departmentsFor('station'),
      deadline: addDaysIst(nowMs, DEADLINE_DAYS.info),
      zone: null,
      stations: [],
      record: rec(id),
    });
  }

  return out.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.deadline.localeCompare(b.deadline) || a.title.localeCompare(b.title),
  );
}

export interface AlertSummary {
  alerts: GovAlert[];
  newCount: number;
  bySeverity: Record<AlertSeverity, number>;
}

export function summariseAlerts(alerts: GovAlert[]): Omit<AlertSummary, 'alerts'> {
  const bySeverity: Record<AlertSeverity, number> = { critical: 0, high: 0, watch: 0, info: 0 };
  let newCount = 0;
  for (const a of alerts) {
    if (a.record.status === 'resolved') continue;
    bySeverity[a.severity]++;
    if (a.record.status === 'new') newCount++;
  }
  return { newCount, bySeverity };
}

export function useAlerts(): AlertSummary {
  const air = useAirData();
  const stations = useStations();
  const records = useGovStore((s) => s.alertRecords);
  const markSeen = useGovStore((s) => s.markSeen);
  const alerts = useMemo(() => buildAlerts({ zones: air.zones, stations, records, nowMs: Date.now() }), [air.zones, stations, records]);
  useEffect(() => {
    markSeen(alerts.map((a) => a.id));
  }, [alerts, markSeen]);
  return useMemo(() => ({ alerts, ...summariseAlerts(alerts) }), [alerts]);
}
