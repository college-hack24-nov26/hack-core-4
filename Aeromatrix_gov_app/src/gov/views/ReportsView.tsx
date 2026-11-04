import { loadLogo, loadSatellite, planNetwork } from '../lib/network';
import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, Loader2, Share2, SlidersHorizontal } from 'lucide-react';
import { useTwinStore } from '../../store/useTwinStore';
import { useGovStore } from '../govStore';
import { useAirData } from '../lib/airdata';
import { loadApportionment, type ApportionmentLoad } from '../lib/apportionment';
import { useHotspots } from '../lib/hotspots';
import { hasMeasures, measureLabels, runMeasures } from '../lib/measures';
import { isTouchPhone } from '../lib/pwa';
import { shareFile } from '../lib/share';
import { nearestStations, useStations } from '../lib/stations';
import { useWeeklyHistory } from '../lib/useHistory';
import { reportContent, reportFileName, type ReportInput } from '../report/govReport';
import { downloadReport, reportBlob } from '../report/reportActions';
import { ReportPreview } from '../report/ReportPreview';
import { Btn, Card, EmptyState, Field, PageTitle, SectionCard, Skeleton, inputCls } from '../ui';

let apportionmentCache: Promise<ApportionmentLoad> | null = null;
const apportionment = () => (apportionmentCache ??= loadApportionment());

export function ReportsView() {
  const base = useTwinStore((s) => s.base);
  const air = useAirData();
  const hot = useHotspots();
  const st = useStations();
  const scenarios = useGovStore((s) => s.scenarios);
  const reportScenarioId = useGovStore((s) => s.reportScenarioId);
  const setReportScenario = useGovStore((s) => s.setReportScenario);
  const simTargetId = useGovStore((s) => s.simTargetId);
  const selectedZoneId = useGovStore((s) => s.selectedZoneId);
  const setSimTarget = useGovStore((s) => s.setSimTarget);
  const measures = useGovStore((s) => s.measures);
  const setView = useGovStore((s) => s.setView);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<'download' | 'preview' | 'share' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [study, setStudy] = useState<ApportionmentLoad>({ status: 'unavailable', reason: 'Loading' });

  useEffect(() => {
    let alive = true;
    void apportionment().then((s) => alive && setStudy(s));
    return () => {
      alive = false;
    };
  }, []);

  const scenario = scenarios.find((s) => s.id === reportScenarioId) ?? null;
  const zoneById = useMemo(() => new Map(air.zones.map((z) => [z.id, z])), [air.zones]);
  const wantedId = scenario ? scenario.target.id : [simTargetId, selectedZoneId].find((id) => id && zoneById.has(id));
  const targetId = (wantedId && zoneById.has(wantedId) ? wantedId : hot.zones[0]?.zone?.id) ?? null;
  const zone = targetId ? zoneById.get(targetId) : undefined;
  const cell = base && targetId ? base.cells.find((c) => c.id === targetId) : undefined;
  const selection = scenario ? scenario.selection : measures;
  const week = useWeeklyHistory(zone ? [{ id: zone.id, location: zone.location }] : [], !!zone);
  const daily = zone ? (week.byId[zone.id] ?? null) : null;
  // the proposed AeroMatrix device network for the area, with its satellite picture and the logo
  const network = useMemo(() => (zone && cell ? planNetwork(zone.place, cell, st.placed) : null), [zone, cell, st.placed]);
  const [netImage, setNetImage] = useState<string | null>(null);
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setNetImage(null);
    if (network) void loadSatellite(network).then((i) => alive && setNetImage(i));
    return () => {
      alive = false;
    };
  }, [network]);
  useEffect(() => {
    void loadLogo().then(setLogo);
  }, []);

  const input: ReportInput | null = useMemo(() => {
    if (!base || !cell || !zone || !hasMeasures(selection)) return null;
    const outcome = runMeasures({ base, cell, zoneName: zone.place, currentPm25: zone.pm25, selection });
    if (!outcome) return null;
    return {
      generated: new Date(),
      zone,
      city: air.city,
      stations: nearestStations(st.placed, zone.location, 3, 15),
      outcome,
      scenarioName: scenario?.name,
      apportionment: study,
      daily,
      network,
      networkImage: netImage,
      logo,
    };
    // `generated` is fixed at the moment the inputs change, which is when the report is (re)built.
  }, [base, cell, zone, selection, scenario, air.city, st.placed, study, daily, network, netImage, logo]);

  const content = useMemo(() => (input ? reportContent(input) : null), [input]);

  useEffect(
    () => () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    },
    [pdfUrl],
  );
  useEffect(() => {
    setPdfUrl(null);
  }, [input]);

  const phone = isTouchPhone({ widthPx: window.innerWidth, coarsePointer: window.matchMedia?.('(pointer: coarse)').matches ?? false });

  const run = async (kind: 'download' | 'preview' | 'share', fn: () => Promise<void>) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The report could not be created.');
    } finally {
      setBusy(null);
    }
  };

  if (!base || air.zones.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 pb-40 pt-6 sm:px-6">
        <PageTitle title="Reports" />
        <Card>
          <EmptyState title="Nothing to report on yet" reason="Area readings are not available right now." />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 pb-40 pt-6 sm:px-6">
      <PageTitle title="Reports" />

      <div className="space-y-4">
        <SectionCard title="Report for">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Area">
              <select
                value={targetId ?? ''}
                onChange={(e) => {
                  setSimTarget(e.target.value);
                  setReportScenario(null);
                }}
                className={inputCls}
                disabled={!!scenario}
              >
                {hot.zones.map((h) => (
                  <option key={h.id} value={h.zone!.id}>
                    {h.name} · AQI {h.aqi}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Plan">
              <select value={reportScenarioId ?? ''} onChange={(e) => setReportScenario(e.target.value || null)} className={inputCls}>
                <option value="">Current Simulator selection{hasMeasures(measures) ? ` (${measureLabels(measures).join(', ')})` : ''}</option>
                {scenarios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="mt-4">
            <Btn icon={SlidersHorizontal} onClick={() => setView('simulator')}>
              Change plan in the Simulator
            </Btn>
          </div>
        </SectionCard>

        {!input || !content ? (
          <Card>
            <EmptyState title="Choose an intervention first" reason="A report needs at least one intervention. Pick one in the Simulator, then come back." />
          </Card>
        ) : (
          <SectionCard title="Report">
            <div className="flex flex-wrap gap-2">
              <Btn variant="primary" icon={busy === 'download' ? Loader2 : Download} disabled={busy !== null} onClick={() => void run('download', () => downloadReport(input))} title={reportFileName(input)}>
                {busy === 'download' ? 'Preparing…' : 'Download PDF'}
              </Btn>
              {phone ? (
                <Btn
                  icon={busy === 'share' ? Loader2 : Share2}
                  disabled={busy !== null}
                  onClick={() =>
                    void run('share', async () => {
                      const blob = await reportBlob(input);
                      const file = new File([blob], reportFileName(input), { type: 'application/pdf' });
                      const r = await shareFile(file, content.title);
                      if (r === 'unsupported') await downloadReport(input);
                      else if (r === 'failed') throw new Error('The share sheet could not open. Use Download instead.');
                    })
                  }
                >
                  Share
                </Btn>
              ) : (
                <Btn
                  icon={busy === 'preview' ? Loader2 : Eye}
                  disabled={busy !== null}
                  onClick={() =>
                    void run('preview', async () => {
                      setPdfUrl(URL.createObjectURL(await reportBlob(input)));
                    })
                  }
                >
                  PDF preview
                </Btn>
              )}
            </div>
            {error && (
              <p role="alert" className="mt-3 text-sm text-accent-300">
                {error}
              </p>
            )}
            {pdfUrl && <iframe title="PDF preview" src={pdfUrl} className="mt-4 h-[70dvh] w-full rounded-xl border border-sand-500/20 bg-white" />}
            {week.status === 'loading' && <Skeleton className="mt-4 h-4 w-48" />}
          </SectionCard>
        )}

        {content && (
          <Card>
            <ReportPreview content={content} />
          </Card>
        )}
      </div>
    </div>
  );
}
