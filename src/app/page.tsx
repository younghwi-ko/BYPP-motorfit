"use client";

import { useMemo, useRef, useState } from "react";

import { AN_SERIES_CATALOG, CandidateSearchCancelledError, CandidateSearchInputError, calculateGsrmReferenceDiameter, createAutomaticCandidateSearchConfig, DEFAULT_GSRM_WALL_THICKNESS_MM, estimateCandidateCount, evaluateAnCatalog, searchCandidatesAsync } from "../engine";
import type { GsrmBatchResult } from "../engine";
import { SCORE_GUIDANCE, sortCandidates } from "./candidate-table";
import type { CandidateSortDirection, CandidateSortKey } from "./candidate-table";
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
  targetThrustEnabled: false,
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

function OptionalField({ label, value, onChange, suffix }: { label: string; value: string; onChange: (value: string) => void; suffix?: string }) {
  return <label className="block">
<span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
<span className="relative block">
<input className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100" type="number" step="any" placeholder="선택 입력" value={value} onChange={(event) => onChange(event.target.value)} />{suffix ? <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-slate-400">{suffix}</span> : null}</span>
</label>;
}

function RangeField({ label, range, onChange, suffix = "mm", disabled = false, inputStep = 5 }: { label: string; range: { min: number; max: number; step?: number }; onChange: (bound: "min" | "max", value: number) => void; suffix?: string; disabled?: boolean; inputStep?: number | "any" }) {
  return (
    <div>
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
      <div className="grid grid-cols-2 gap-2">
        {(["min", "max"] as const).map((bound) => <label key={bound} className="relative block">
<span className="sr-only">{label} {bound}</span>
<input className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 pr-10 text-sm text-slate-900 outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-100 disabled:bg-slate-100" type="number" step={inputStep} disabled={disabled} value={range[bound]} onChange={(event) => onChange(bound, Number(event.target.value))} />
<span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-[11px] text-slate-400">{suffix}</span>
</label>)}
      </div>
      <p className="mt-1 text-[11px] text-slate-400">최소 · 최대</p>
    </div>
  );
}

function StatusPill({ status }: { status: "pass" | "conditional" | "fail" }) {
  if (status === "pass") return <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-700">추천</span>;
  if (status === "conditional") return <span className="rounded-full bg-cyan-100 px-2.5 py-1 text-xs font-bold text-cyan-700">조건부</span>;
  return <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-700">탈락</span>;
}

function SortHeader({ label, sortKey, activeKey, direction, onSort }: { label: string; sortKey: CandidateSortKey; activeKey: CandidateSortKey | null; direction: CandidateSortDirection | null; onSort: (key: CandidateSortKey) => void }) {
  const icon = activeKey === sortKey ? (direction === "asc" ? "↑" : "↓") : "↕";
  return <th className={`px-4 py-3 ${activeKey === sortKey ? "text-cyan-700" : ""}`}>
<button type="button" onClick={() => onSort(sortKey)} className="inline-flex items-center gap-1 rounded-md font-bold hover:text-cyan-700 focus:outline-none focus:ring-2 focus:ring-cyan-300" aria-label={`${label} ${activeKey === sortKey ? (direction === "asc" ? "오름차순" : "내림차순") : "정렬 안 함"}. 클릭하여 정렬 변경`}>{label}<span aria-hidden="true" className="text-sm">{icon}</span>
</button>
</th>;
}

function LineChart({ points, color, xLabel, yLabel, targetY }: { points: Array<{ x: number; y: number }>; color: string; xLabel: string; yLabel: string; targetY?: number }) {
  const width = 720;
  const height = 240;
  const padding = 30;
  const xMax = Math.max(...points.map((point) => point.x), 1);
  const yMax = Math.max(...points.map((point) => point.y), targetY ?? 0, 1);
  const polyline = points.map((point) => `${padding + (point.x / xMax) * (width - padding * 2)},${height - padding - (point.y / yMax) * (height - padding * 2)}`).join(" ");
  return <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 p-3">
<div className="mb-2 flex items-center justify-between text-[11px] text-slate-400">
<span>x축: {xLabel}</span>
<span>y축: {yLabel}</span>
</div>
<svg viewBox={`0 0 ${width} ${height}`} className="h-52 w-full" role="img" aria-label={`${xLabel}에 따른 ${yLabel} 그래프`}>
<line x1={padding} y1={height - padding} x2={width - padding} y2={height - padding} stroke="#334155" />
<line x1={padding} y1={padding} x2={padding} y2={height - padding} stroke="#334155" />
{targetY !== undefined ? <line x1={padding} y1={height - padding - (targetY / yMax) * (height - padding * 2)} x2={width - padding} y2={height - padding - (targetY / yMax) * (height - padding * 2)} stroke="#f8fafc" strokeWidth="2" strokeDasharray="8 6"><title>{`목표 평균 추력: ${formatNumber(targetY, 2)} N`}</title></line> : null}
<polyline points={polyline} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />{points.map((point, index) => <circle key={`${point.x}-${point.y}-${index}`} cx={padding + (point.x / xMax) * (width - padding * 2)} cy={height - padding - (point.y / yMax) * (height - padding * 2)} r="3" fill={color}>
<title>{`${xLabel}: ${formatNumber(point.x, 4)} · ${yLabel}: ${formatNumber(point.y, 4)}`}</title>
</circle>)}</svg>
</div>;
}

function GraphKpis({ items }: { items: Array<{ label: string; value: string }> }) {
  return <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{items.map((item) => <div key={item.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
<p className="text-[10px] font-semibold text-slate-500">{item.label}</p>
<p className="mt-1 text-sm font-bold text-slate-900">{item.value}</p>
</div>)}</div>;
}

function MetricCard({ label, value, unit, tone = "slate" }: { label: string; value: string; unit: string; tone?: "slate" | "cyan" | "amber" }) {
  const tones = { slate: "border-slate-200 bg-white", cyan: "border-cyan-100 bg-cyan-50/70", amber: "border-amber-100 bg-amber-50/70" };
  return <div className={`rounded-2xl border p-4 ${tones[tone]}`}>
<p className="text-xs font-semibold text-slate-500">{label}</p>
<p className="mt-2 text-xl font-bold tracking-tight text-slate-950">{value}</p>
<p className="mt-0.5 text-xs text-slate-500">{unit}</p>
</div>;
}

function RecommendationRow({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "emerald" | "amber" }) {
  const colors = { slate: "text-slate-700", emerald: "text-emerald-700", amber: "text-amber-700" };
  return <li className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
<span className="text-slate-500">{label}</span>
<span className={`text-right font-semibold ${colors[tone]}`}>{value}</span>
</li>;
}

function AnCatalogPanel({ referenceDiameterMm }: { referenceDiameterMm: number }) {
  const [results, setResults] = useState<GsrmBatchResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const run = () => { setRunning(true); window.setTimeout(() => { try { setResults(evaluateAnCatalog(referenceDiameterMm, AN_SERIES_CATALOG)); } finally { setRunning(false); } }, 0); };
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
<div>
<p className="text-sm font-bold text-slate-950">AN 시리즈 전체 검사</p>
<p className="mt-1 text-xs leading-5 text-slate-500">AS 568A O-Ring 규격표의 표시 행을 GSRM Calculator 모드로 반복 적용합니다. B = {referenceDiameterMm.toFixed(2)} mm, NBR 70 경도.</p>
</div>
<button type="button" onClick={run} disabled={running} className="rounded-xl bg-violet-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-violet-700 disabled:cursor-wait disabled:opacity-60">{running ? "검사 중…" : "AN 시리즈 전체 검사"}</button>
</div>{results ? <div className="mt-4">
<div className="grid gap-2 text-xs sm:grid-cols-3">
<div className="rounded-xl bg-slate-50 px-3 py-2">검사 {results.length}개</div>
<div className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-800">GSRM 기준 추천 {results.filter((r) => r.calculation.check.status === "recommend").length}개</div>
<div className="rounded-xl bg-amber-50 px-3 py-2 text-amber-800">추가 검토 {results.filter((r) => r.calculation.check.status !== "recommend").length}개</div>
</div>
<div className="mt-3 overflow-x-auto">
<table className="w-full min-w-[760px] text-left text-xs">
<thead className="bg-slate-50 text-[11px] text-slate-500">
<tr>
<th className="px-3 py-2">형번</th>
<th className="px-3 py-2">ID</th>
<th className="px-3 py-2">T</th>
<th className="px-3 py-2">OD</th>
<th className="px-3 py-2">압축률</th>
<th className="px-3 py-2">홈 충전율</th>
<th className="px-3 py-2">판정</th>
<th className="px-3 py-2">이유</th>
</tr>
</thead>
<tbody className="divide-y divide-slate-100">{results.slice(0, 20).map((row) => <tr key={row.partNumber} className={row.sizeNo === 132 ? "bg-cyan-50" : undefined}>
<td className="px-3 py-2 font-semibold">{row.partNumber}{row.sizeNo === 132 ? " · GSRM 기준" : ""}</td>
<td className="px-3 py-2">{row.innerDiameterMm.toFixed(2)} mm</td>
<td className="px-3 py-2">{row.crossSectionMm.toFixed(2)} mm</td>
<td className="px-3 py-2">{row.calculation.outsideDiameterMm.toFixed(2)} mm</td>
<td className="px-3 py-2">{row.calculation.compressionPercent.toFixed(1)}%</td>
<td className="px-3 py-2">{row.calculation.grooveFillPercent.toFixed(1)}%</td>
<td className="px-3 py-2 font-bold">{row.calculation.check.status === "recommend" ? "GSRM 기준 추천" : row.calculation.check.status === "conditional" ? "조건부 추천" : "GSRM 기준 탈락"}</td>
<td className="px-3 py-2 text-slate-500">{row.calculation.check.reasons.join(", ") || "기하학적 조건 통과"}</td>
</tr>)}</tbody>
</table>
</div>
<p className="mt-3 text-[11px] leading-5 text-slate-500">본 결과는 SRM 계산 결과와 GSRM Calculator의 기하학적 Engineering Check를 기반으로 한 교육 및 설계 검토 결과입니다. 실제 압력·온도·재질·조립 조건에 대한 최종 적합성을 보증하지 않습니다.</p>
</div> : <p className="mt-3 text-xs text-slate-500">버튼을 눌러 선택된 SRM 후보의 GSRM 기준 직경으로 전체 규격을 검사하세요.</p>}</div>;
}

export default function Home() {
  const [mode, setMode] = useState<"candidate" | "excel">("candidate");
  const [config, setConfig] = useState<CandidateSearchConfig>(DEFAULT_CONFIG);
  const [search, setSearch] = useState<CandidateSearchResult | null>(null);
  const [selected, setSelected] = useState<CandidateResult | null>(null);
  const [running, setRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [sortKey, setSortKey] = useState<CandidateSortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<CandidateSortDirection | null>(null);
  const [gsrmWallThicknessMm, setGsrmWallThicknessMm] = useState(DEFAULT_GSRM_WALL_THICKNESS_MM);
  const [automaticMode, setAutomaticMode] = useState(true);
  const [targetThrustText, setTargetThrustText] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [progressText, setProgressText] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const cancelRequested = useRef(false);

  const updateNumber = (key: keyof CandidateSearchConfig, value: number) => setConfig((current) => ({ ...current, [key]: value }));
  const updateRange = (key: "outerDiameterMm" | "coreDiameterMm" | "segmentLengthMm", bound: "min" | "max", value: number) => setConfig((current) => ({ ...current, [key]: { ...current[key], [bound]: value } }));
  const resetToBaseline = () => {
    setMode("candidate");
    setAutomaticMode(true);
    setDetailsOpen(false);
    setTargetThrustText("");
    setConfig({ ...DEFAULT_CONFIG, outerDiameterMm: { ...DEFAULT_CONFIG.outerDiameterMm }, coreDiameterMm: { ...DEFAULT_CONFIG.coreDiameterMm }, segmentLengthMm: { ...DEFAULT_CONFIG.segmentLengthMm }, segmentCount: { ...DEFAULT_CONFIG.segmentCount } });
    setSearch(null);
    setSelected(null);
    setErrorMessage(null);
    setSortKey(null);
    setSortDirection(null);
    setGsrmWallThicknessMm(DEFAULT_GSRM_WALL_THICKNESS_MM);
    setProgressText("");
    setProgressPercent(0);
  };
  const runSearch = async () => {
    cancelRequested.current = false;
    const parsedTargetThrust = Number(targetThrustText);
    const targetThrustEnabled = targetThrustText.trim() !== "";
    const baseConfig: CandidateSearchConfig = { ...config, targetAverageThrustN: targetThrustEnabled ? parsedTargetThrust : config.targetAverageThrustN, targetThrustEnabled, mode, burnTimeFilterEnabled: automaticMode ? false : config.burnTimeFilterEnabled };
    const runConfig: CandidateSearchConfig = mode === "excel" ? { ...baseConfig, targetThrustEnabled: true, outerDiameterMm: { min: config.outerDiameterMm.min, max: config.outerDiameterMm.min, step: 1 }, coreDiameterMm: { min: config.coreDiameterMm.min, max: config.coreDiameterMm.min, step: 1 }, segmentLengthMm: { min: config.segmentLengthMm.min, max: config.segmentLengthMm.min, step: 1 }, segmentCount: { min: config.segmentCount.min, max: config.segmentCount.min }, maxCandidateCount: 1 } : automaticMode ? createAutomaticCandidateSearchConfig(baseConfig) : { ...baseConfig, maxCandidateCount: Number.MAX_SAFE_INTEGER };
    const totalCandidates = estimateCandidateCount(runConfig);
    const plannedPrecision = Math.min(totalCandidates, runConfig.maxCandidateCount ?? totalCandidates);
    setRunning(true);
    setProgressText(`0 / ${plannedPrecision.toLocaleString()}개 정밀 계산 준비 · 전체 ${totalCandidates.toLocaleString()}개 후보`);
    setProgressPercent(0);
    setErrorMessage(null);
    setSortKey(null);
    setSortDirection(null);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
    try {
      const result = await searchCandidatesAsync(runConfig, {
        batchSize: 10,
        shouldCancel: () => cancelRequested.current,
        onProgress: ({ completed, total }) => {
          setProgressText(`${completed.toLocaleString()} / ${total.toLocaleString()}개 정밀 계산 · 전체 ${totalCandidates.toLocaleString()}개 후보`);
          setProgressPercent(total === 0 ? 100 : (completed / total) * 100);
        },
      });
      if (cancelRequested.current) return;
      setSearch(result);
      setSelected(result.candidates[0] ?? null);
      setSortKey(null);
      setSortDirection(null);
    } catch (error) {
      if (error instanceof CandidateSearchCancelledError) return;
      const message = error instanceof CandidateSearchInputError ? error.issues.join(" ") : "후보 계산 중 오류가 발생했습니다. 입력 범위와 물성값을 확인한 뒤 다시 시도하세요.";
      setErrorMessage(message);
      setSearch(null);
      setSelected(null);
    } finally {
      setRunning(false);
      setProgressText("");
      setProgressPercent(0);
    }
  };
  const sortedCandidates = useMemo(() => search ? sortCandidates(search.candidates, sortKey, sortDirection) : [], [search, sortDirection, sortKey]);
  const toggleSort = (key: CandidateSortKey) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDirection("asc");
    } else if (sortDirection === "asc") {
      setSortDirection("desc");
    } else {
      setSortKey(null);
      setSortDirection(null);
    }
  };
  const selectedCharts = useMemo(() => {
    if (!selected) return null;
    const pressureRows = [...selected.pressure.combustion.rows, ...selected.pressure.blowdown.rows];
    const maximumPressureRow = pressureRows.reduce((max, row) => row.gaugePressureMpa > max.gaugePressureMpa ? row : max, pressureRows[0]);
    const maximumKnPoint = selected.dataAndKn.knCurve.reduce((max, row) => row.kn > max.kn ? row : max, selected.dataAndKn.knCurve[0]);
    return {
      thrust: selected.performance.rows.map((row) => ({ x: row.timeSec, y: row.thrustN })),
      pressure: pressureRows.map((row) => ({ x: row.timeSec, y: row.gaugePressureMpa })),
      kn: selected.dataAndKn.knCurve.map((row) => ({ x: row.regressionMm, y: row.kn })),
      knKpis: [
        { label: "초기 Kn", value: formatNumber(selected.dataAndKn.knCurve[0].kn, 3) },
        { label: "최대 Kn", value: formatNumber(selected.dataAndKn.maximumKn, 3) },
        { label: "최소 Kn", value: formatNumber(selected.dataAndKn.minimumKn, 3) },
        { label: "평균 Kn", value: formatNumber(selected.dataAndKn.averageKn, 3) },
        { label: "최대 Kn 회귀 거리", value: `${formatNumber(maximumKnPoint.regressionMm, 3)} mm` },
      ],
      pressureKpis: [
        { label: "최대 압력", value: `${formatNumber(selected.pressure.maximumGaugePressureMpa, 4)} MPa` },
        { label: "최대 압력 시점", value: `${formatNumber(maximumPressureRow.timeSec, 4)} s` },
        { label: "연소 종료 압력", value: `${formatNumber(selected.pressure.combustion.rows.at(-1)?.gaugePressureMpa ?? 0, 4)} MPa` },
        { label: "추력 종료 시점", value: `${formatNumber(selected.pressure.thrustEndTimeSec, 4)} s` },
      ],
      thrustKpis: [
        ...(selected.thrustEvaluation ? [
          { label: "목표 추력", value: `${formatNumber(selected.thrustEvaluation.targetThrustN, 2)} N` },
          { label: "평균제곱오차", value: `${formatNumber(selected.thrustEvaluation.meanSquaredErrorN2, 2)} N²` },
          { label: "최대 편차", value: `${formatNumber(selected.thrustEvaluation.maximumDeviationN, 2)} N` },
          { label: "추력 변동성", value: `${formatNumber(selected.thrustEvaluation.variabilityN, 2)} N` },
        ] : []),
        { label: "최대 추력", value: `${formatNumber(selected.performance.maximumThrustN, 2)} N` },
        { label: "평균 추력", value: `${formatNumber(selected.performance.averageThrustN, 2)} N` },
        { label: "총충격량", value: `${formatNumber(selected.performance.totalImpulseNs, 2)} N·s` },
        { label: "비추력", value: `${formatNumber(selected.performance.specificImpulseSec, 3)} s` },
        { label: "추력 종료 시간", value: `${formatNumber(selected.performance.thrustEndTimeSec, 4)} s` },
      ],
    };
  }, [selected]);
  const selectedRecommendation = useMemo(() => {
    if (!selected) return null;
    const step = config.manufacturingStepMm ?? 5;
    const dimensionsOnStep = [selected.input.grainOuterDiameterMm, selected.input.grainCoreDiameterMm, selected.input.segmentLengthMm].every((value) => Number.isInteger(value) && value % step === 0);
    return {
      massError: selected.grainMassKg - config.targetFuelMassKg,
      pressureMargin: config.maximumPressureMpa - selected.maximumPressureMpa,
      thrustError: selected.averageThrustN - config.targetAverageThrustN,
      burnTimeError: selected.burnTimeSec - config.targetBurnTimeSec,
      dimensionsOnStep,
    };
  }, [config, selected]);
  const gsrmReferenceDiameterMm = selected ? calculateGsrmReferenceDiameter(selected.input.chamberDiameterMm, gsrmWallThicknessMm) : null;

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
<div className="mx-auto max-w-[1500px] px-5 py-6 sm:px-8 lg:px-12">
      <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
<div>
<p className="text-xs font-bold tracking-[0.24em] text-cyan-700 uppercase">MotorFit · MVP</p>
<h1 className="mt-2 text-3xl font-bold tracking-[-0.04em] text-slate-950 sm:text-5xl">형상 후보를 계산하고 비교합니다.</h1>
<p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600 sm:text-base">SRM_2023.xls의 계산 순서를 TypeScript로 재현해, 제작 가능한 그레인 형상 후보를 한 번에 검토하는 교육용 설계 분석 도구입니다.</p>
</div>
<div className="flex flex-wrap items-center gap-2">
<span className="w-fit rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-800">교육용 시뮬레이션 결과</span>
<button type="button" onClick={resetToBaseline} className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:border-cyan-300 hover:text-cyan-700">기준 설계로 초기화</button>
</div>
</header>
      <details open={guideOpen} onToggle={(event) => setGuideOpen(event.currentTarget.open)} className="mt-4 rounded-2xl border border-cyan-100 bg-cyan-50/70">
<summary className="cursor-pointer list-none px-4 py-3 text-sm font-bold text-cyan-900">사용 설명서 <span className="ml-2 text-xs font-normal text-cyan-700">입력부터 설계 검토까지</span>
</summary>
<div className="grid gap-3 border-t border-cyan-100 px-4 py-4 text-sm text-cyan-950 sm:grid-cols-2 lg:grid-cols-5">
<div>
<p className="font-bold">1. 입력 조건 설정</p>
<p className="mt-1 text-xs leading-5 text-cyan-800">챔버, 추진제, 형상 범위와 목표 허용 오차를 입력합니다.</p>
</div>
<div>
<p className="font-bold">2. 후보 탐색</p>
<p className="mt-1 text-xs leading-5 text-cyan-800">제작 후보 모드에서 5 mm 간격 조합을 계산합니다.</p>
</div>
<div>
<p className="font-bold">3. 후보 선택</p>
<p className="mt-1 text-xs leading-5 text-cyan-800">결과 표에서 후보를 선택하면 상세 카드가 열립니다.</p>
</div>
<div>
<p className="font-bold">4. 그래프 확인</p>
<p className="mt-1 text-xs leading-5 text-cyan-800">압력·추력·Kn 그래프로 계산 흐름을 확인합니다.</p>
</div>
<div>
<p className="font-bold">5. 설계 검토</p>
<p className="mt-1 text-xs leading-5 text-cyan-800">목표 오차와 압력 여유, 통과 사유를 함께 검토합니다.</p>
</div>
</div>
</details>
      <div className="mt-4 flex flex-wrap gap-2 text-xs font-semibold text-slate-600">
<span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">구현 완료: Data and Kn</span>
<span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">Pressure</span>
<span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">Blowdown</span>
<span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-700">Performance</span>
<span className="rounded-full border border-cyan-200 bg-white px-3 py-1 text-cyan-700">SRM_2023.xls 계산식 기반</span>
<span className="rounded-full border border-cyan-200 bg-white px-3 py-1 text-cyan-700">기준 케이스 검증 완료</span>
</div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[360px_1fr]">
        <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
<div className="flex rounded-xl bg-slate-100 p-1">{(["candidate", "excel"] as const).map((option) => <button key={option} type="button" onClick={() => setMode(option)} className={`flex-1 rounded-lg px-3 py-2 text-xs font-bold transition ${mode === option ? "bg-white text-cyan-700 shadow-sm" : "text-slate-500"}`}>{option === "candidate" ? "제작 후보 모드" : "Excel 재현 모드"}</button>)}</div>
<p className="mt-3 rounded-xl bg-cyan-50 px-3 py-2 text-xs leading-5 text-cyan-800">{mode === "candidate" ? "Do · do · Lo는 정수 mm, 기본 5 mm 간격으로 후보를 생성합니다." : "원본 Excel 재현을 위해 소수 mm 입력을 허용하며 제작 단위 제약을 적용하지 않습니다."}</p>
          <div className="mt-6 space-y-5">
<div className="rounded-2xl border border-cyan-100 bg-cyan-50/60 p-4">
<p className="text-sm font-bold text-slate-950">단계형 자동 추천</p>
<div className="mt-3 space-y-4">
<div><p className="mb-2 text-xs font-bold text-cyan-800">1단계 · 목표 연료 질량</p><Field label="목표 연료 질량" value={config.targetFuelMassKg} onChange={(value) => updateNumber("targetFuelMassKg", value)} suffix="kg" /><button type="button" onClick={runSearch} disabled={running} className="mt-2 w-full rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white disabled:opacity-60">질량 기준 계산</button></div>
<div><p className="mb-2 text-xs font-bold text-cyan-800">2단계 · 최대 허용 압력</p><Field label="최대 허용 압력" value={config.maximumPressureMpa} onChange={(value) => updateNumber("maximumPressureMpa", value)} suffix="MPa" /><button type="button" onClick={runSearch} disabled={running} className="mt-2 w-full rounded-lg border border-cyan-300 bg-white px-3 py-2 text-xs font-bold text-cyan-800 disabled:opacity-60">압력 조건 적용</button></div>
<div><p className="mb-2 text-xs font-bold text-cyan-800">3단계 · 목표 평균 추력</p><OptionalField label="목표 평균 추력" value={targetThrustText} onChange={setTargetThrustText} suffix="N" /><p className="mt-1 text-[11px] leading-5 text-slate-500">{targetThrustText.trim() === "" ? "목표 추력이 입력되지 않아 질량과 압력 중심으로 추천합니다." : "추력 곡선과 목표 추력선의 오차를 함께 평가합니다."}</p><button type="button" onClick={runSearch} disabled={running} className="mt-2 w-full rounded-lg border border-cyan-300 bg-white px-3 py-2 text-xs font-bold text-cyan-800 disabled:opacity-60">최종 추천 계산</button></div>
</div>
<div className="mt-4">
<label className="block">
<span className="mb-1.5 block text-xs font-semibold text-slate-600">추진제</span>
<select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" value={config.propellant} onChange={(event) => setConfig((current) => ({ ...current, propellant: event.target.value as CandidateSearchConfig["propellant"] }))}>{PROPELLANTS.map((propellant) => <option key={propellant}>{propellant}</option>)}</select>
</label>
</div>
</div>
<div className="rounded-2xl border border-slate-200 bg-white">
<button type="button" onClick={() => { setAutomaticMode(false); setDetailsOpen((open) => !open); }} className="w-full cursor-pointer px-4 py-3 text-left text-sm font-bold text-slate-800">{detailsOpen ? "상세 설정 닫기" : "상세 설정 열기"} <span className="ml-2 text-xs font-normal text-slate-500">챔버·형상 범위·허용 오차</span>
</button>
<div className={`${detailsOpen ? "" : "hidden"} space-y-5 border-t border-slate-100 px-4 pb-4`}>
<div>
<p className="mb-3 pt-4 text-sm font-bold text-slate-950">기본 형상</p>
<div className="grid grid-cols-2 gap-3">
<Field label="챔버 직경" value={config.chamberDiameterMm} onChange={(value) => updateNumber("chamberDiameterMm", value)} suffix="mm" />
<Field label="챔버 길이" value={config.chamberLengthMm} onChange={(value) => updateNumber("chamberLengthMm", value)} suffix="mm" />
</div>
<label className="mt-3 block">
<span className="mb-1.5 block text-xs font-semibold text-slate-600">추진제</span>
<select className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" value={config.propellant} onChange={(event) => setConfig((current) => ({ ...current, propellant: event.target.value as CandidateSearchConfig["propellant"] }))}>{PROPELLANTS.map((propellant) => <option key={propellant}>{propellant}</option>)}</select>
</label>
<div className="mt-3 grid grid-cols-2 gap-3">
<Field label="밀도비" value={config.densityRatio} onChange={(value) => updateNumber("densityRatio", value)} />
<Field label="노즐 침식" value={config.nozzleErosionMm} onChange={(value) => updateNumber("nozzleErosionMm", value)} suffix="mm" />
</div>
</div>
            <div className="border-t border-slate-100 pt-5">
<p className="mb-3 text-sm font-bold text-slate-950">형상 범위</p>
<div className="space-y-3">
<RangeField label="Do · 외경" range={config.outerDiameterMm} inputStep={mode === "excel" ? "any" : 5} onChange={(bound, value) => updateRange("outerDiameterMm", bound, value)} />
<RangeField label="do · 코어 직경" range={config.coreDiameterMm} inputStep={mode === "excel" ? "any" : 5} onChange={(bound, value) => updateRange("coreDiameterMm", bound, value)} />
<RangeField label="Lo · 세그먼트 길이" range={config.segmentLengthMm} inputStep={mode === "excel" ? "any" : 5} onChange={(bound, value) => updateRange("segmentLengthMm", bound, value)} />
<div className="grid grid-cols-2 gap-3">
<Field label="세그먼트 수 최소" value={config.segmentCount.min} step={1} onChange={(value) => setConfig((current) => ({ ...current, segmentCount: { ...current.segmentCount, min: Math.round(value) } }))} />
<Field label="세그먼트 수 최대" value={config.segmentCount.max} step={1} onChange={(value) => setConfig((current) => ({ ...current, segmentCount: { ...current.segmentCount, max: Math.round(value) } }))} />
</div>
</div>
</div>
            <div className="border-t border-slate-100 pt-5">
<p className="mb-3 text-sm font-bold text-slate-950">목표와 허용 오차</p>
<div className="grid grid-cols-2 gap-3">
<Field label="목표 연료 질량" value={config.targetFuelMassKg} onChange={(value) => updateNumber("targetFuelMassKg", value)} suffix="kg" />
<Field label="질량 허용 오차" value={config.fuelMassToleranceKg} onChange={(value) => updateNumber("fuelMassToleranceKg", value)} suffix="kg" />
<Field label="최대 허용 압력" value={config.maximumPressureMpa} onChange={(value) => updateNumber("maximumPressureMpa", value)} suffix="MPa" />
<Field label="목표 압력" value={config.targetPressureMpa} onChange={(value) => updateNumber("targetPressureMpa", value)} suffix="MPa" />
<Field label="목표 평균 추력" value={config.targetAverageThrustN} onChange={(value) => updateNumber("targetAverageThrustN", value)} suffix="N" />
<Field label="추력 허용 오차" value={config.averageThrustToleranceN} onChange={(value) => updateNumber("averageThrustToleranceN", value)} suffix="N" />
<Field label="목표 연소 시간" value={config.targetBurnTimeSec} onChange={(value) => updateNumber("targetBurnTimeSec", value)} suffix="s" />
<Field label="시간 허용 오차" value={config.burnTimeToleranceSec} onChange={(value) => updateNumber("burnTimeToleranceSec", value)} suffix="s" />
</div>
</div>
</div>
          </div>
</div>
<button type="button" onClick={runSearch} disabled={running} className={`${automaticMode && mode !== "excel" ? "hidden" : "mt-6"} w-full rounded-xl bg-cyan-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-600/20 transition hover:bg-cyan-700 disabled:cursor-wait disabled:opacity-60`}>{running ? "계산 중…" : mode === "excel" ? "Excel 재현 계산" : "상세 후보 탐색 실행"}</button>
{running ? <div className="mt-3 rounded-xl border border-cyan-100 bg-cyan-50 px-3 py-2 text-xs text-cyan-900"><div className="h-1.5 overflow-hidden rounded-full bg-cyan-100"><div className="h-full rounded-full bg-cyan-500 transition-[width]" style={{ width: `${progressPercent}%` }} /></div><div className="mt-2 flex items-center justify-between gap-2"><span>{progressText}</span><button type="button" onClick={() => { cancelRequested.current = true; setProgressText("계산 취소 요청 중…"); }} className="rounded-lg border border-cyan-300 bg-white px-2 py-1 font-bold">계산 취소</button></div></div> : null}
<p className="mt-3 text-center text-[11px] text-slate-400">계산은 버튼을 누를 때 브라우저에서 실행됩니다.</p>
        </aside>
        <section className="min-w-0">{errorMessage ? <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-800">
<p className="font-bold">입력을 확인하세요</p>
<p>{errorMessage}</p>
</div> : null}{!search ? <div className="grid min-h-[620px] place-items-center rounded-3xl border border-dashed border-slate-300 bg-white/60 p-8 text-center">
<div>
<div className="mx-auto grid size-16 place-items-center rounded-2xl bg-cyan-100 text-3xl">⌁</div>
<h2 className="mt-5 text-xl font-bold text-slate-950">후보 계산을 시작하세요</h2>
<p className="mt-2 max-w-md text-sm leading-6 text-slate-500">기본 데모 입력은 KNSB coarse 기준 케이스입니다. 탐색을 실행하면 실제 Data and Kn → Pressure → Blowdown → Performance 결과가 표시됩니다.</p>
</div>
</div> : <div className="space-y-6">
<div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
<div>
<p className="text-sm font-bold text-slate-950">탐색 결과</p>
<p className="mt-1 text-xs text-slate-500">전체 {search.totalCombinations.toLocaleString()}개 · 정밀 계산 전 형상 제외 {(search.prevalidationRejectedCount ?? search.rejectedByValidation).toLocaleString()}개 · 질량 상한 제외 {(search.massFilteredCount ?? 0).toLocaleString()}개 · 질량 계산 {(search.prefilteredCandidateCount ?? search.totalCombinations).toLocaleString()}개 · 정밀 계산 {search.evaluatedCombinations.toLocaleString()}개 · 정밀 검증 탈락 {(search.precisionValidationRejectedCount ?? 0).toLocaleString()}개 · 추천 {search.candidates.filter((candidate) => candidate.status === "pass").length}개 · 조건부 {search.candidates.filter((candidate) => candidate.status === "conditional").length}개 · 탈락 {search.candidates.filter((candidate) => candidate.status === "fail").length}개 · 계산 실패 {search.calculationFailures.toLocaleString()}개</p>
</div>
<div className="flex gap-2 text-xs">
<span className="rounded-full bg-emerald-100 px-2.5 py-1 font-bold text-emerald-700">추천 {search.candidates.filter((candidate) => candidate.status === "pass").length}</span>
<span className="rounded-full bg-cyan-100 px-2.5 py-1 font-bold text-cyan-700">조건부 {search.candidates.filter((candidate) => candidate.status === "conditional").length}</span>
<span className="rounded-full bg-slate-100 px-2.5 py-1 font-bold text-slate-600">탈락 {search.candidates.filter((candidate) => candidate.status === "fail").length}</span>
</div>
</div>{search.warning ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">⚠ {search.warning}</div> : null}{search.candidates.length === 0 ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-900">
<p className="font-bold">{search.diagnosis === "목표 질량 이하 후보를 찾지 못했습니다." ? "목표 질량 이하 후보를 찾지 못했습니다." : "조건을 만족한 후보가 없습니다."}</p>
<p className="mt-1">자동 탐색 범위, 질량 오차, 압력 제한과 목표 추력 조건을 확인하고 상세 설정에서 허용 오차를 조정해보세요.</p>
</div> : null}<div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs leading-5 text-slate-600">
<p className="font-bold text-slate-900">점수 기준 안내</p>
<p className="mt-1">{SCORE_GUIDANCE}</p>
<p className="mt-1 text-slate-500">질량 오차와 압력 제한을 기본으로 평가하고, 목표 추력 입력 시 추력 곡선 오차를 추가합니다.</p>
</div>
<div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
<div className="overflow-x-auto">
<table className="w-full min-w-[900px] text-left text-xs">
<thead className="bg-slate-50 text-[11px] font-bold text-slate-500">
<tr>
<SortHeader label="상태" sortKey="status" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
<th className="px-4 py-3">Do × do × Lo / 세그먼트</th>
<SortHeader label="질량" sortKey="mass" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
<SortHeader label="최대압력" sortKey="pressure" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
<SortHeader label="연소시간" sortKey="burnTime" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
<SortHeader label="평균추력" sortKey="averageThrust" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
<SortHeader label="점수" sortKey="score" activeKey={sortKey} direction={sortDirection} onSort={toggleSort} />
</tr>
</thead>
<tbody className="divide-y divide-slate-100">{sortedCandidates.slice(0, 12).map((candidate) => <tr key={`${candidate.input.grainOuterDiameterMm}-${candidate.input.grainCoreDiameterMm}-${candidate.input.segmentLengthMm}-${candidate.input.segmentCount}`} onClick={() => setSelected(candidate)} className={`cursor-pointer transition hover:bg-cyan-50 ${selected === candidate ? "bg-cyan-50" : ""}`}>
<td className="px-4 py-3">
<StatusPill status={candidate.status} />
</td>
<td className="px-4 py-3 font-semibold text-slate-800">{candidate.input.grainOuterDiameterMm} × {candidate.input.grainCoreDiameterMm} × {candidate.input.segmentLengthMm} / {candidate.input.segmentCount}</td>
<td className="px-4 py-3 text-slate-600">{formatNumber(candidate.grainMassKg, 4)} kg</td>
<td className="px-4 py-3 text-slate-600">{formatNumber(candidate.maximumPressureMpa, 4)} MPa</td>
<td className="px-4 py-3 text-slate-600">{formatNumber(candidate.burnTimeSec, 4)} s</td>
<td className="px-4 py-3 text-slate-600">{formatNumber(candidate.averageThrustN, 2)} N</td>
<td className="px-4 py-3 font-bold text-cyan-700">{formatNumber(candidate.score.totalScore, 1)}</td>
</tr>)}</tbody>
</table>
</div>
</div>{selected ? <div className="space-y-6">
<div className="flex items-center justify-between">
<div>
<p className="text-xs font-bold tracking-[0.18em] text-cyan-700 uppercase">Selected candidate</p>
<h2 className="mt-1 text-2xl font-bold text-slate-950">Do {selected.input.grainOuterDiameterMm} · do {selected.input.grainCoreDiameterMm} · Lo {selected.input.segmentLengthMm} mm</h2>
<p className="mt-1 text-sm text-slate-500">{selected.input.segmentCount} segments · {selected.motorClass}-class · 종합 점수 {formatNumber(selected.score.totalScore, 1)}</p>
</div>
<StatusPill status={selected.status} />
</div>
<div className="rounded-2xl border border-violet-100 bg-violet-50/60 px-4 py-3">
<div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
<div>
<p className="text-xs font-bold uppercase tracking-[0.12em] text-violet-700">GSRM 오링 기준 직경 변환</p>
<p className="mt-1 text-xs text-violet-900">SRM 챔버 내경 {formatNumber(selected.input.chamberDiameterMm, 2)} mm + 벽 두께 {formatNumber(gsrmWallThicknessMm, 2)} mm/side × 2 = <strong>{formatNumber(gsrmReferenceDiameterMm ?? 0, 2)} mm</strong>
</p>
</div>
<label className="block w-full sm:w-40">
<span className="mb-1 block text-[11px] font-semibold text-violet-800">벽 두께 (한쪽)</span>
<span className="relative block">
<input type="number" min="0" step="0.1" value={gsrmWallThicknessMm} onChange={(event) => { const value = Number(event.target.value); setGsrmWallThicknessMm(Number.isFinite(value) && value >= 0 ? value : 0); }} className="w-full rounded-xl border border-violet-200 bg-white px-3 py-2 pr-12 text-sm text-slate-900 outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-100" />
<span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">mm/side</span>
</span>
</label>
</div>
</div>
<AnCatalogPanel referenceDiameterMm={gsrmReferenceDiameterMm ?? 0} />
<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
<MetricCard label="연료 질량" value={formatNumber(selected.grainMassKg, 4)} unit="kg" tone="cyan" />
<MetricCard label="최대 압력" value={formatNumber(selected.maximumPressureMpa, 4)} unit="MPa gauge" tone="amber" />
<MetricCard label="평균 추력" value={formatNumber(selected.averageThrustN, 2)} unit="N" />
<MetricCard label="총충격량" value={formatNumber(selected.totalImpulseNs, 2)} unit="N·s" />
<MetricCard label="연소 시간" value={formatNumber(selected.burnTimeSec, 4)} unit="s" />
<MetricCard label="추력 종료" value={formatNumber(selected.thrustEndTimeSec, 4)} unit="s" />
<MetricCard label="최대 추력" value={formatNumber(selected.maximumThrustN, 2)} unit="N" />
<MetricCard label="비추력" value={formatNumber(selected.specificImpulseSec, 3)} unit="s" />
<MetricCard label="노즐 출구 직경" value={formatNumber(selected.performance.nozzleExitDiameterMm, 3)} unit="mm" />
<MetricCard label="노즐 출구 면적" value={formatNumber(selected.performance.nozzleExitAreaMm2, 2)} unit="mm²" />
</div>{selectedRecommendation ? <div className="rounded-2xl border border-cyan-100 bg-cyan-50/60 px-4 py-4">
<p className="text-sm font-bold text-cyan-950">추천 이유</p>
<ul className="mt-2 text-xs">
<RecommendationRow label="목표 질량 오차" value={`${selectedRecommendation.massError >= 0 ? "+" : ""}${formatNumber(selectedRecommendation.massError, 5)} kg`} tone={Math.abs(selectedRecommendation.massError) <= config.fuelMassToleranceKg ? "emerald" : "amber"} />
<RecommendationRow label="최대 압력 여유" value={`${formatNumber(selectedRecommendation.pressureMargin, 4)} MPa`} tone={selectedRecommendation.pressureMargin >= 0 ? "emerald" : "amber"} />
<RecommendationRow label="평균 추력 오차" value={`${selectedRecommendation.thrustError >= 0 ? "+" : ""}${formatNumber(selectedRecommendation.thrustError, 2)} N`} tone={Math.abs(selectedRecommendation.thrustError) <= config.averageThrustToleranceN ? "emerald" : "amber"} />
<RecommendationRow label="연소 시간 오차" value={`${selectedRecommendation.burnTimeError >= 0 ? "+" : ""}${formatNumber(selectedRecommendation.burnTimeError, 4)} s`} tone={Math.abs(selectedRecommendation.burnTimeError) <= config.burnTimeToleranceSec ? "emerald" : "amber"} />
<RecommendationRow label="제작 치수 간격" value={selectedRecommendation.dimensionsOnStep ? `${config.manufacturingStepMm ?? 5} mm 배수` : "간격 조건 확인 필요"} tone={selectedRecommendation.dimensionsOnStep ? "emerald" : "amber"} />
<RecommendationRow label="판정 사유" value={selected.status === "pass" ? "모든 목표 허용 범위 통과" : selected.reasons.join(" ")} tone={selected.status === "pass" ? "emerald" : "amber"} />
</ul>
</div> : null}{selected.reasons.length ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
<p className="font-bold">탈락·경고 사유</p>
<ul className="mt-1 list-disc pl-5">{selected.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
</div> : <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">모든 목표 허용 범위를 만족한 후보입니다.</div>}{selectedCharts ? <div className="grid gap-4 2xl:grid-cols-2">
<div>
<h3 className="mb-2 text-sm font-bold text-slate-950">추력 · 시간</h3>
<GraphKpis items={selectedCharts.thrustKpis} />
<LineChart points={selectedCharts.thrust} color="#22d3ee" xLabel="시간 (s)" yLabel="추력 (N)" targetY={selected.thrustEvaluation?.targetThrustN} />
</div>
<div>
<h3 className="mb-2 text-sm font-bold text-slate-950">압력 · 시간</h3>
<GraphKpis items={selectedCharts.pressureKpis} />
<LineChart points={selectedCharts.pressure} color="#f59e0b" xLabel="시간 (s)" yLabel="게이지 압력 (MPa)" />
</div>
<div>
<h3 className="mb-2 text-sm font-bold text-slate-950">Kn 곡선</h3>
<GraphKpis items={selectedCharts.knKpis} />
<LineChart points={selectedCharts.kn} color="#a78bfa" xLabel="회귀 거리 (mm)" yLabel="Kn" />
</div>
</div> : null}</div> : null}</div>}</section>
      </div>
      <footer className="mt-8 border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500">본 도구는 교육 및 설계 검토용 시뮬레이터이며 실제 제작·점화 절차를 제공하지 않습니다. 모든 화면 수치는 현재 TypeScript 계산 엔진의 결과입니다.</footer>
    </div>
</main>
  );
}
