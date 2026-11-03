import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, SlidersHorizontal } from 'lucide-react';
import { useTwinStore } from '../../store/useTwinStore';
import { useGovStore } from '../govStore';
import { useAirData } from '../lib/airdata';
import { useHotspots } from '../lib/hotspots';
import { hasMeasures, measureLabels, runMeasures } from '../lib/measures';
import { nearestStations, useStations } from '../lib/stations';
import { formatIst } from '../lib/format';
import { buildReportPdf, downloadReport, reportContent, reportFileName, type ReportInput } from '../report/govReport';
import { Btn, EmptyState, Field, PageTitle, SectionCard, StatusChip, Table, inputCls } from '../ui';

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scenario = scenarios.find((s) => s.id === reportScenarioId) ?? null;
  const zoneById = useMemo(() => new Map(air.zones.map((z) => [z.id, z])), [air.zones]);
  const wantedId = scenario ? scenario.target.id : [simTargetId, selectedZoneId].find((id) => id && zoneById.has(id));
  const targetId = (wantedId && zoneById.has(wantedId) ? wantedId : hot.zones[0]?.zone?.id) ?? null;
  const zone = targetId ? zoneById.get(targetId) : undefined;
  const cell = base && targetId ? base.cells.find((c) => c.id === targetId) : undefined;
  const selection = scenario ? scenario.selection : measures;

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
    };
    // `generated` is fixed at the moment the inputs change, which is when the report is (re)built.
  }, [base, cell, zone, selection, scenario, air.city, st.placed]);

  const content = useMemo(() => (input ? reportContent(input) : null), [input]);

  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);
  useEffect(() => {
    setPdfUrl(null);
  }, [input]);

  if (!base || air.zones.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-4 pb-32">
        <PageTitle title="Reports" />
        <EmptyState title="No area values to report on" reason="A report needs the current model estimate for an area. There is no live model data right now (no data feed), so nothing is shown rather than a made-up number." />
      </div>
    );
  }

  const preview = () => {
    if (!input) return;
    setBusy(true);
    setError(null);
    try {
      const blob = buildReportPdf(input).output('blob');
      setPdfUrl(URL.createObjectURL(blob));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The PDF could not be built.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl p-4 pb-32">
      <PageTitle title="Reports" sub="A costed implementation report for one area and one scenario: sections A to I, ready to preview and download." />

      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="1. Area">
          <Field label="Hotspot or area">
            <select value={targetId ?? ''} onChange={(e) => { setSimTarget(e.target.value); setReportScenario(null); }} className={inputCls} disabled={!!scenario}>
              {hot.zones.map((h) => (
                <option key={h.id} value={h.zone!.id}>{h.name} (AQI {h.aqi}, {h.category})</option>
              ))}
            </select>
          </Field>
          {scenario && <p className="mt-2 text-xs text-sand-300">The area is fixed by the saved scenario. Choose &quot;current Simulator selection&quot; to pick another.</p>}
        </SectionCard>
        <SectionCard title="2. Scenario">
          <Field label="Saved scenario, or what you are building now">
            <select value={reportScenarioId ?? ''} onChange={(e) => setReportScenario(e.target.value || null)} className={inputCls}>
              <option value="">Current Simulator selection ({hasMeasures(measures) ? measureLabels(measures).join(', ') : 'nothing chosen'})</option>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <div className="mt-3"><Btn icon={SlidersHorizontal} onClick={() => setView('simulator')}>Build or change in the Simulator</Btn></div>
        </SectionCard>
      </div>

      {!input || !content ? (
        <div className="mt-4">
          <EmptyState title="Choose measures first" reason="A report needs at least one measure. Open the Simulator, choose measures for an area, and come back here (or save the scenario)." />
        </div>
      ) : (
        <SectionCard className="mt-4" title="3. Preview and download" action={<StatusChip kind="simulation" />}>
          <div className="mb-3 flex flex-wrap gap-2">
            <Btn variant="primary" icon={Download} onClick={() => downloadReport(input)} title={reportFileName(input)}>Download PDF</Btn>
            <Btn icon={Eye} onClick={preview} disabled={busy}>{busy ? 'Building…' : pdfUrl ? 'Rebuild PDF preview' : 'Show PDF preview'}</Btn>
          </div>
          {error && <p role="alert" className="mb-2 text-sm text-accent-300">{error}</p>}
          {pdfUrl && <iframe title="PDF preview" src={pdfUrl} className="mb-4 h-[70dvh] w-full rounded-xl bg-white hairline" />}

          <article aria-label="Report preview" className="rounded-xl bg-ink-950 p-4 hairline">
            <h2 className="font-display text-xl font-bold text-sand-50">{content.title}</h2>
            <p className="text-xs text-sand-300">{content.subtitle}. {content.generatedText}.</p>
            <ul className="mt-2 space-y-1 text-[11px] text-sand-400">{content.statuses.map((x) => <li key={x}>{x}</li>)}</ul>
            {content.sections.map((s) => (
              <section key={s.id} className="mt-5">
                <h3 className="text-sm font-bold text-accent-300">{s.id}. {s.title}</h3>
                {s.paragraphs.map((p, i) => <p key={i} className="mt-1 text-xs text-sand-200">{p}</p>)}
                {s.tables.map((t, i) => (
                  <div key={i} className="mt-2"><Table head={t.head} rows={t.foot ? [...t.body, t.foot.map((x) => <b key={x}>{x}</b>)] : t.body} /></div>
                ))}
                {s.bullets.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-sand-200">{s.bullets.map((b, i) => <li key={i}>{b}</li>)}</ul>
                )}
              </section>
            ))}
            <p className="mt-5 text-[11px] text-sand-400">Prepared {formatIst(input.generated.getTime())}. The app sends nothing; the Commissioner issues each instruction.</p>
          </article>
        </SectionCard>
      )}
    </div>
  );
}
