import { FileText, RadioTower } from 'lucide-react';
import { useTwinStore } from '../../store/useTwinStore';
import { useGovStore } from '../govStore';
import { useAirData } from '../lib/airdata';
import { nearestZone } from '../lib/hotspots';
import { STATUS_LABEL, countStations, useStations, type StationRow, type StationStatus } from '../lib/stations';
import { formatAge, formatIst } from '../lib/format';
import { AqiChip, Btn, EmptyState, PageTitle, SectionCard, StatusChip, Table, type ChipKind } from '../ui';
import { Sheet } from '../Sheet';

const chipOf = (s: StationStatus): ChipKind => (s === 'live' ? 'measured' : s === 'outdated' ? 'outdated' : s === 'estimate' ? 'estimated' : 'nofeed');

function StationDetail({ s, onClose }: { s: StationRow; onClose: () => void }) {
  const air = useAirData();
  const openReport = useGovStore((x) => x.openReport);
  const zone = nearestZone(air.zones, [s.lon, s.lat]);
  return (
    <Sheet
      title={s.name}
      subtitle={[s.agency, s.city].filter(Boolean).join(' · ') || 'Monitoring station'}
      onClose={onClose}
      chips={<StatusChip kind={chipOf(s.status)} label={s.status === 'estimate' ? 'Estimated (no reading)' : undefined} />}
    >
      <div className="space-y-5">
        {s.readings.length > 0 ? (
          <section>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-sand-400">Last reading</h3>
            {s.aqi && (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <AqiChip aqi={s.aqi.value} category={s.aqi.category} />
                <StatusChip kind={s.status === 'live' ? 'measured' : 'outdated'} />
                <span className="text-xs text-sand-300">
                  CPCB AQI from station data{s.aqi.lowerBound ? ' (lower bound)' : ''}
                  {s.aqi.periodEnd ? `, period ending ${formatIst(s.aqi.periodEnd)}` : ''}
                </span>
              </div>
            )}
            <Table
              head={['Pollutant', 'Value', 'Hour', 'Age']}
              rows={s.readings.map((r) => [r.label, `${r.value.toFixed(r.value < 10 ? 2 : 0)} ${r.unit}`, formatIst(r.time), formatAge(s.lastReadingAt === null ? null : (s.ageMs ?? 0) + (s.lastReadingAt - r.time))])}
            />
            {s.status !== 'live' && (
              <p className="mt-2 rounded-xl bg-amber-600/10 p-3 text-xs text-sand-100 hairline">
                These readings are OUTDATED: the newest is from {formatIst(s.lastReadingAt)} ({formatAge(s.ageMs)}). They are shown with their dates and are not today&apos;s air quality.
              </p>
            )}
          </section>
        ) : (
          <EmptyState title="No data feed" reason="The station-data service has no reading for this station." />
        )}

        {s.status !== 'live' && s.estimate && (
          <section className="rounded-xl bg-ink-800 p-3 hairline">
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-sand-400">Model estimate for this location</h3>
            <div className="flex flex-wrap items-center gap-2">
              <AqiChip aqi={s.estimate.aqi} category={s.estimate.category} />
              <StatusChip kind="estimated" />
            </div>
            <p className="mt-2 text-xs text-sand-300">
              This station has no current reading, so this is a MODEL ESTIMATE (Open-Meteo CAMS, about 40 km resolution) for the place, not a measurement. Model hour {formatIst(s.estimate.asOf)}.
            </p>
          </section>
        )}

        {s.forecast && (
          <section>
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-sand-400">PM2.5 forecast (trained model)</h3>
            <div className="flex flex-wrap items-center gap-2 text-sm text-sand-100">
              <StatusChip kind="forecast" />
              <span className="font-bold">{s.forecast.value.toFixed(0)} ug/m3</span>
              <span className="text-xs text-sand-300">
                interval {s.forecast.lower.toFixed(0)} to {s.forecast.upper.toFixed(0)}, valid {formatIst(s.forecast.validAt)}
              </span>
            </div>
            <p className="mt-1 text-xs text-sand-300">
              Model kind: {s.forecast.kind.replace(/_/g, ' ')}.{s.forecast.historical ? ' This forecast is for a past period (historical).' : ''}
            </p>
          </section>
        )}

        <section>
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-sand-400">Where this station is</h3>
          <p className="text-xs text-sand-300">
            {s.lat.toFixed(4)}°N, {s.lon.toFixed(4)}°E ({s.coordSource === 'service' ? 'from the station-data service' : 'sourced coordinate list'}).
          </p>
          {s.sources.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-xs text-sand-300">
              {s.sources.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
          {s.singleSource && <p className="mt-2 rounded-lg bg-amber-600/10 p-2 text-xs text-sand-100 hairline">Single source: only one list gives this coordinate, so treat the position as unconfirmed.</p>}
          {s.note && <p className="mt-1 text-xs text-sand-300">{s.note}</p>}
        </section>

        {zone && (
          <Btn icon={FileText} onClick={() => openReport(zone.id)} className="w-full">
            Create report for {zone.place}
          </Btn>
        )}
      </div>
    </Sheet>
  );
}

export function StationsView() {
  const st = useStations();
  const selectedId = useGovStore((s) => s.selectedStationId);
  const select = useGovStore((s) => s.selectStation);
  const verified = useTwinStore((s) => s.verified);
  const c = countStations(st);
  const selected = st.placed.find((s) => s.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-5xl p-4 pb-32">
      <PageTitle title="Monitoring stations" sub="Stations appear only where a sourced coordinate exists. A station with no current reading is never shown as current." />

      {st.placed.length === 0 ? (
        <EmptyState
          icon={RadioTower}
          title="Sourced station coordinates not loaded"
          reason={`${st.notice ?? 'No station can be placed.'} ${st.modelService.status !== 'online' ? 'The station-data service is not reachable either, so there are no station readings ("No data feed").' : ''}`}
        />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap gap-2 text-xs">
            <StatusChip kind="measured" label={`${c.live} measured now`} />
            <StatusChip kind="outdated" label={`${c.outdated} outdated`} />
            <StatusChip kind="estimated" label={`${c.estimate} estimated only`} />
            <StatusChip kind="nofeed" label={`${c.noFeed} no data feed`} />
          </div>
          <SectionCard>
            <Table
              caption="Monitoring stations"
              head={['Station', 'Status', 'Last reading', 'Freshness', 'Pollutants', 'Coordinate']}
              rows={st.placed.map((s) => [
                <button key="n" type="button" onClick={() => select(s.id)} className="gov-tap min-h-11 text-left font-bold text-accent-300 underline-offset-2 hover:underline">
                  {s.name}
                </button>,
                <StatusChip key="s" kind={chipOf(s.status)} label={STATUS_LABEL[s.status]} />,
                s.readings.length > 0 ? (
                  <span key="r">
                    {s.aqi ? <AqiChip aqi={s.aqi.value} category={s.aqi.category} /> : `${s.readings[0].label} ${s.readings[0].value.toFixed(0)} ${s.readings[0].unit}`}
                    <span className="mt-1 block text-sand-400">{formatIst(s.lastReadingAt)}</span>
                  </span>
                ) : s.estimate ? (
                  <span key="r">
                    <AqiChip aqi={s.estimate.aqi} category={s.estimate.category} />
                    <span className="mt-1 block text-sand-400">model estimate, not a reading</span>
                  </span>
                ) : (
                  'No data feed'
                ),
                s.readings.length > 0 ? formatAge(s.ageMs) : 'no reading',
                s.readings.length > 0 ? s.readings.map((r) => r.label).join(', ') : 'none',
                <span key="c" className="text-sand-300">
                  {s.sources.length} source{s.sources.length === 1 ? '' : 's'}
                  {s.singleSource ? ' (single source)' : ''}
                </span>,
              ])}
            />
          </SectionCard>
        </>
      )}

      <SectionCard title={`Not placed (${st.notPlaced.length})`} className="mt-4">
        {st.notPlaced.length === 0 ? (
          <p className="text-xs text-sand-300">{verified?.status === 'loaded' ? 'Every listed station has a sourced coordinate.' : 'The sourced list is not loaded, so no station is listed as not placed either.'}</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-sand-300">These stations are not drawn anywhere because no sourced coordinate exists. They provide no monitoring coverage on the map.</p>
            <ul className="space-y-1.5 text-xs">
              {st.notPlaced.map((n) => (
                <li key={n.name} className="rounded-lg bg-ink-800 px-3 py-2 hairline">
                  <span className="font-bold text-sand-50">{n.name}</span>
                  <span className="block text-sand-300">{n.reason}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </SectionCard>

      {selected && <StationDetail key={selected.id} s={selected} onClose={() => select(null)} />}
    </div>
  );
}
