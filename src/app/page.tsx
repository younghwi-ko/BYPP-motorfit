"use client";

import { useMemo, useState } from "react";

import { CandidateSearchInputError, searchCandidates } from "../engine";
import type {
  CandidateResult,
  CandidateSearchConfig,
  CandidateSearchResult,
} from "../engine";

const DEFAULT_CONFIG: CandidateSearchConfig = {
  mode: "candidate",
  chamberDiameterMm: 45,
  chamberLengthMm: 165,
  propellant: "KNSB coarse",
  targetFuelMassKg: 0.3956,
  fuelMassToleranceKg: 0.005,
  maximumPressureMpa: 4.1,
  targetAverageThrustN: 209.845,
  averageThrustToleranceN: 5,
  targetBurnTimeSec: 2.1767,
  burnTimeToleranceSec: 0.03,
  targetPressureMpa: 4,
  outerDiameterMm: { min: 40, max: 50, step: 5 },
  coreDiameterMm: { min: 10, max: 20, step: 5 },
  segmentLengthMm: { min: 75, max: 85, step: 5 },
  segmentCount: { min: 2, max: 2 },
  outerSurface: "Inhibited",
  coreSurface: "Exposed",
  endsSurface: "Exposed",
  densityRatio: 0.95,
  nozzleErosionMm: 0,
  manufacturingStepMm: 5,
  maxCandidateCount: 200,
};

const PROPELLANTS = [
  "KNDX",
  "KNSB fine",
  "KNSB coarse",
  "KNSU",
  "KNER coarse",
  "KNMN coarse",
  "KNPSB",
  "KNFR",
] as const;

const formatNumber = (value: number, digits = 3) =>
  value.toLocaleString("ko-KR", { maximumFractionDigits: digits });

function Field({ label, value, step = "any", onChange, suffix }: { label: string; value: number; step?: number | "any"; onChange: (value: number) => void; suffix?: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      <span className="relative block">
        <input className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" type="number" step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
        {suffix ? <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-400">{suffix}</span> : null}
      </span>
    </label>
  );
}

function RangeField({ label, range, onChange, suffix = "mm", disabled = false }: { label: string; range: { min: number; max: number; step?: number }; onChange: (bound: "min" | "max", value: number) => void; suffix?: string; disabled?: boolean }) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        {(["min", "max"] as const).map((bound) => <label key={bound} className="relative block"><span className="sr-only">{label} {bound}</span><input className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-10 text-sm text-slate-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100" type="number" step="any" disabled={disabled} value={range[bound]} onChange={(event) => onChange(bound, Number(event.target.value))} /><span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[11px] text-slate-400">{suffix}</span></label>)}
      </div>
      <p className="mt-1 text-[11px] text-slate-400">최소 · 최대</p>
    </div>
  );
}

function StatusPill({ status }: { status: "pass" | "fail" }) {
  return status === "pass" ? <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">통과</span> : <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">탈락</span>;
}

function LineChart({ points, color, yLabel }: { points: Array<{ x: number; y: number }>; color: string; yLabel: string }) {
  const width = 720;
  const height = 240;
  const padding = 30;
  const xMax = Math.max(...points.map((point) => point.x), 1);
  const yMax = Math.max(...points.map((point) => point.y), 1);
  const polyline = points.map((point) => `${padding + (point.x / xMax) * (width - padding * 2)},${height - padding - (point.y / yMax) * (height - padding * 2)}`).join(" ");
  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 p-3"><div className="mb-2 flex items-center justify-between text-[11px] text-slate-400"><span>x축: 시간 (s)</span><span>y축: {yLabel}</span></div><svg viewBox={`0 0 ${width} ${height}`} className="h-52 w-full" role="img" aria-label={`시간에 따른 ${yLabel} 그래프`}><line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#334155" /><line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#334155" /><polyline points={polyline} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" /></svg></div>;
}

function MetricCard({ label, value, unit, tone = "slate" }: { label: string; value: string; unit: string; tone?: "slate" | "cyan" | "amber" }) {
  const tones = { slate: "border-slate-200 bg-white", cyan: "border-cyan-100 bg-cyan-50/70", amber: "border-amber-100 bg-amber-50/70" };
  return <div className={`rounded-2xl border p-4 ${tones[tone]}`}><p className="text-xs font-semibold text-slate-500">{label}</p><p className="mt-2 text-xl font-bold tracking-tight text-slate-950">{value}</p><p className="mt-0.5 text-xs text-slate-500">{unit}</p></div>;
}

export default function Home() {
  const [mode, setMode] = useState<"candidate" | "excel">("candidate");
  const [config, setConfig] = useState<CandidateSearchConfig>(DEFAULT_CONFIG);
  const [search, setSearch] = useState<CandidateSearchResult | null>(null);
  const [selected, setSelected] = useState<CandidateResult | null>(null);
  const [running, setRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const updateNumber = (key: keyof CandidateSearchConfig, value: number) => setConfig((current) => ({ ...current, [key]: value }));
  const updateRange = (key: "outerDiameterMm" | "coreDiameterMm" | "segmentLengthMm", bound: "min" | "max", value: number) => setConfig((current) => ({ ...current, [key]: { ...current[key], [bound]: value } }));
  const runSearch = () => {
    setRunning(true);
    setErrorMessage(null);
    window.setTimeout(() => {
      try {
        const runConfig: CandidateSearchConfig = { ...config, mode, outerDiameterMm: mode === "excel" ? { min: config.outerDiameterMm.min, max: config.outerDiameterMm.min, step: 1 } : config.outerDiameterMm, coreDiameterMm: mode === "excel" ? { min: config.coreDiameterMm.min, max: config.coreDiameterMm.min, step: 1 } : config.coreDiameterMm, segmentLengthMm: mode === "excel" ? { min: config.segmentLengthMm.min, max: config.segmentLengthMm.min, step: 1 } : config.segmentLengthMm, segmentCount: mode === "excel" ? { min: config.segmentCount.min, max: config.segmentCount.min } : config.segmentCount, maxCandidateCount: mode === "excel" ? 1 : config.maxCandidateCount };
        const result = searchCandidates(runConfig);
        setSearch(result);
        setSelected(result.candidates[0] ?? null);
      } catch (error) {
        const message = error instanceof CandidateSearchInputError ? error.issues.join(" ") : "후보 계산 중 오류가 발생했습니다. 입력 범위와 물성값을 확인한 뒤 다시 시도하세요.";
        setErrorMessage(message);
        setSearch(null);
        setSelected(null);
      } finally {
        setRunning(false);
      }
    }, 0);
  };
  const selectedCharts = useMemo(() => {
    if (!selected) return null;
    return { thrust: selected.performance.rows.map((row) => ({ x: row.timeSec, y: row.thrustN })), pressure: [...selected.pressure.combustion.rows.map((row) => ({ x: row.timeSec, y: row.gaugePressureMpa })), ...selected.pressure.blowdown.rows.map((row) => ({ x: row.timeSec, y: row.gaugePressureMpa }))], kn: selected.dataAndKn.knCurve.map((row) => ({ x: row.regressionMm, y: row.kn })) };
  }, [selected]);

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]"><div className="mx-auto max-w-[1500px] px-5 py-6 sm:px-8 lg:px-12">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-bold tracking-[0.24em] text-cyan-700 uppercase">MotorFit · MVP</p><h1 className="mt-2 text-3xl font-bold tracking-[-0.04em] text-slate-950 sm:text-5xl">형상 후보를 계산하고 비교합니다.</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">SRM_2023.xls의 계산 순서를 TypeScript로 재현해, 제작 가능한 그레인 형상 후보를 한 번에 검토하는 교육용 설계 분석 도구입니다.</p></div><span className="w-fit rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">교육용 시뮬레이션 결과</span></header>
      <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-600"><span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">구현 완료: Data and Kn</span><span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">Pressure</span><span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">Blowdown</span><span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">Performance</span></div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[360px_1fr]">
        <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6"><div className="flex rounded-xl bg-slate-100 p-1">{(["candidate", "excel"] as const).map((option) => <button key={option} type="button" onClick={() => setMode(option)} className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition ${mode === option ? "bg-white text-cyan-700 shadow-sm" : "text-slate-500"}`}>{option === "candidate" ? "제작 후보 모드" : "Excel 재현 모드"}</button>)}</div><p className="mt-3 rounded-xl bg-cyan-50 px-3 py-2 text-xs leading-5 text-cyan-800">{mode === "candidate" ? "Do · do · Lo는 정수 mm, 기본 5 mm 간격으로 후보를 생성합니다." : "원본 Excel 재현을 위해 소수 mm 입력을 허용하며 제작 단위 제약을 적용하지 않습니다."}</p>
          <div className="mt-6 space-y-5"><div><p className="mb-3 text-sm font-bold text-slate-950">기본 형상</p><div className="grid grid-cols-2 gap-3"><Field label="챔버 직경" value={config.chamberDiameterMm} onChange={(value) => updateNumber("chamberDiameterMm", value)} suffix="mm" /><Field label="챔버 길이" value={config.chamberLengthMm} onChange={(value) => updateNumber("chamberLengthMm", value)} suffix="mm" /></div><label className="mt-3 block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">추진제</span><select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" value={config.propellant} onChange={(event) => setConfig((current) => ({ ...current, propellant: event.target.value as CandidateSearchConfig["propellant"] }))}>{PROPELLANTS.map((propellant) => <option key={propellant}>{propellant}</option>)}</select></label><div className="mt-3 grid grid-cols-2 gap-3"><Field label="밀도비" value={config.densityRatio} onChange={(value) => updateNumber("densityRatio", value)} /><Field label="노즐 침식" value={config.nozzleErosionMm} onChange={(value) => updateNumber("nozzleErosionMm", value)} suffix="mm" /></div></div>
            <div className="border-t border-slate-100 pt-5"><p className="mb-3 text-sm font-bold text-slate-950">형상 범위</p><div className="space-y-3"><RangeField label="Do · 외경" range={config.outerDiameterMm} onChange={(bound, value) => updateRange("outerDiameterMm", bound, value)} /><RangeField label="do · 코어 직경" range={config.coreDiameterMm} onChange={(bound, value) => updateRange("coreDiameterMm", bound, value)} /><RangeField label="Lo · 세그먼트 길이" range={config.segmentLengthMm} onChange={(bound, value) => updateRange("segmentLengthMm", bound, value)} /><div className="grid grid-cols-2 gap-3"><Field label="세그먼트 수 최소" value={config.segmentCount.min} step={1} onChange={(value) => setConfig((current) => ({ ...current, segmentCount: { ...current.segmentCount, min: Math.round(value) } }))} /><Field label="세그먼트 수 최대" value={config.segmentCount.max} step={1} onChange={(value) => setConfig((current) => ({ ...current, segmentCount: { ...current.segmentCount, max: Math.round(value) } }))} /></div></div></div>
            <div className="border-t border-slate-100 pt-5"><p className="mb-3 text-sm font-bold text-slate-950">목표와 허용 오차</p><div className="grid grid-cols-2 gap-3"><Field label="목표 연료 질량" value={config.targetFuelMassKg} onChange={(value) => updateNumber("targetFuelMassKg", value)} suffix="kg" /><Field label="질량 허용 오차" value={config.fuelMassToleranceKg} onChange={(value) => updateNumber("fuelMassToleranceKg", value)} suffix="kg" /><Field label="최대 허용 압력" value={config.maximumPressureMpa} onChange={(value) => updateNumber("maximumPressureMpa", value)} suffix="MPa" /><Field label="목표 압력" value={config.targetPressureMpa} onChange={(value) => updateNumber("targetPressureMpa", value)} suffix="MPa" /><Field label="목표 평균 추력" value={config.targetAverageThrustN} onChange={(value) => updateNumber("targetAverageThrustN", value)} suffix="N" /><Field label="추력 허용 오차" value={config.averageThrustToleranceN} onChange={(value) => updateNumber("averageThrustToleranceN", value)} suffix="N" /><Field label="목표 연소 시간" value={config.targetBurnTimeSec} onChange={(value) => updateNumber("targetBurnTimeSec", value)} suffix="s" /><Field label="시간 허용 오차" value={config.burnTimeToleranceSec} onChange={(value) => updateNumber("burnTimeToleranceSec", value)} suffix="s" /></div></div></div>
          <button type="button" onClick={runSearch} disabled={running} className="mt-6 w-full rounded-xl bg-cyan-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-600/20 transition hover:bg-cyan-700 disabled:cursor-wait disabled:opacity-60">{running ? "계산 중…" : mode === "candidate" ? "후보 탐색 실행" : "Excel 재현 계산"}</button><p className="mt-3 text-center text-[11px] text-slate-400">계산은 버튼을 누를 때 브라우저에서 실행됩니다.</p>
        </aside>
        <section className="min-w-0">{errorMessage ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-800"><p className="font-bold">입력을 확인하세요</p><p>{errorMessage}</p></div> : null}{!search ? <div className="grid min-h-[620px] place-items-center rounded-3xl border border-dashed border-slate-300 bg-white/60 p-8 text-center"><div><div className="mx-auto grid size-16 place-items-center rounded-2xl bg-cyan-100 text-3xl">⌁</div><h2 className="mt-5 text-xl font-bold text-slate-950">후보 계산을 시작하세요</h2><p className="mt-2 max-w-md text-sm leading-6 text-slate-500">기본 데모 입력은 KNSB coarse 기준 케이스입니다. 탐색을 실행하면 실제 Data and Kn → Pressure → Blowdown → Performance 결과가 표시됩니다.</p></div></div> : <div className="space-y-6"><div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold text-slate-950">탐색 결과</p><p className="mt-1 text-xs text-slate-500">{search.evaluatedCombinations.toLocaleString()}개 계산 · {search.passedCandidates.length.toLocaleString()}개 통과 · {search.rejectedByValidation.toLocaleString()}개 제약 제외 · {search.calculationFailures.toLocaleString()}개 계산 실패</p></div><div className="flex gap-2 text-xs"><span className="rounded-full bg-emerald-100 px-2.5 py-1 font-bold text-emerald-700">통과 {search.passedCandidates.length}</span><span className="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-600">탈락 {search.candidates.length - search.passedCandidates.length}</span></div></div>{search.warning ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">⚠ {search.warning}</div> : null}{search.candidates.length === 0 ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-900"><p className="font-bold">조건을 만족한 후보가 없습니다.</p><p className="mt-1">Do &gt; do, 챔버에 들어가는 그레인 길이와 양의 연소 면적을 확인하고, 목표 허용 오차 또는 최대 압력 범위를 조금 넓혀 다시 계산해 보세요.</p></div> : null}<div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-xs"><thead className="bg-slate-50 text-[11px] font-bold text-slate-500"><tr><th className="px-4 py-3">상태</th><th className="px-4 py-3">Do × do × Lo / 세그먼트</th><th className="px-4 py-3">질량</th><th className="px-4 py-3">최대압력</th><th className="px-4 py-3">연소시간</th><th className="px-4 py-3">평균추력</th><th className="px-4 py-3">점수</th></tr></thead><tbody className="divide-y divide-slate-100">{search.candidates.slice(0, 12).map((candidate) => <tr key={`${candidate.input.grainOuterDiameterMm}-${candidate.input.grainCoreDiameterMm}-${candidate.input.segmentLengthMm}-${candidate.input.segmentCount}`} onClick={() => setSelected(candidate)} className={`cursor-pointer transition hover:bg-cyan-50 ${selected === candidate ? "bg-cyan-50" : ""}`}><td className="px-4 py-3"><StatusPill status={candidate.status} /></td><td className="px-4 py-3 font-semibold text-slate-800">{candidate.input.grainOuterDiameterMm} × {candidate.input.grainCoreDiameterMm} × {candidate.input.segmentLengthMm} / {candidate.input.segmentCount}</td><td className="px-4 py-3 text-slate-600">{formatNumber(candidate.grainMassKg, 4)} kg</td><td className="px-4 py-3 text-slate-600">{formatNumber(candidate.maximumPressureMpa, 4)} MPa</td><td className="px-4 py-3 text-slate-600">{formatNumber(candidate.burnTimeSec, 4)} s</td><td className="px-4 py-3 text-slate-600">{formatNumber(candidate.averageThrustN, 2)} N</td><td className="px-4 py-3 font-bold text-cyan-700">{formatNumber(candidate.score.totalScore, 1)}</td></tr>)}</tbody></table></div></div>{selected ? <div className="space-y-6"><div className="flex items-center justify-between"><div><p className="text-xs font-bold tracking-[0.18em] text-cyan-700 uppercase">Selected candidate</p><h2 className="mt-1 text-2xl font-bold text-slate-950">Do {selected.input.grainOuterDiameterMm} · do {selected.input.grainCoreDiameterMm} · Lo {selected.input.segmentLengthMm} mm</h2><p className="mt-1 text-sm text-slate-500">{selected.input.segmentCount} segments · {selected.motorClass}-class · 종합 점수 {formatNumber(selected.score.totalScore, 1)}</p></div><StatusPill status={selected.status} /></div><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><MetricCard label="연료 질량" value={formatNumber(selected.grainMassKg, 4)} unit="kg" tone="cyan" /><MetricCard label="최대 압력" value={formatNumber(selected.maximumPressureMpa, 4)} unit="MPa gauge" tone="amber" /><MetricCard label="평균 추력" value={formatNumber(selected.averageThrustN, 2)} unit="N" /><MetricCard label="총충격량" value={formatNumber(selected.totalImpulseNs, 2)} unit="N·s" /><MetricCard label="연소 시간" value={formatNumber(selected.burnTimeSec, 4)} unit="s" /><MetricCard label="추력 종료" value={formatNumber(selected.thrustEndTimeSec, 4)} unit="s" /><MetricCard label="최대 추력" value={formatNumber(selected.maximumThrustN, 2)} unit="N" /><MetricCard label="비추력" value={formatNumber(selected.specificImpulseSec, 3)} unit="s" /><MetricCard label="노즐 출구 직경" value={formatNumber(selected.performance.nozzleExitDiameterMm, 3)} unit="mm" /><MetricCard label="노즐 출구 면적" value={formatNumber(selected.performance.nozzleExitAreaMm2, 2)} unit="mm²" /></div>{selected.reasons.length ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"><p className="font-bold">탈락·경고 사유</p><ul className="mt-1 list-disc pl-5">{selected.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div> : <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">모든 목표 허용 범위를 만족한 후보입니다.</div>}{selectedCharts ? <div className="grid gap-4 2xl:grid-cols-2"><div><h3 className="mb-2 text-sm font-bold text-slate-950">추력 · 시간</h3><LineChart points={selectedCharts.thrust} color="#22d3ee" yLabel="추력 (N)" /></div><div><h3 className="mb-2 text-sm font-bold text-slate-950">압력 · 시간</h3><LineChart points={selectedCharts.pressure} color="#f59e0b" yLabel="게이지 압력 (MPa)" /></div><div><h3 className="mb-2 text-sm font-bold text-slate-950">Kn 곡선</h3><LineChart points={selectedCharts.kn} color="#a78bfa" yLabel="Kn" /></div></div> : null}</div> : null}</div>}</section>
      </div>
      <footer className="mt-8 border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500">MotorFit은 학습·설계 검토용 시뮬레이터입니다. 추진제 제조, 점화, 제작 절차는 포함하지 않습니다. 모든 화면 수치는 현재 TypeScript 계산 엔진의 결과입니다.</footer>
    </div></main>
  );
}
