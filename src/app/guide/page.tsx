import Link from "next/link";
import { DEMO_INPUT } from "../demo-config";

const steps = [
  { number: "1", title: "목표 입력", body: "목표 연료 질량과 최대 허용 압력을 입력합니다. 목표 평균 추력은 알고 있을 때만 입력합니다." },
  { number: "2", title: "계산 실행", body: "질량 계산 → 압력 조건 적용 → 추력 조건 적용(입력 시) → 최종 후보 판정 순서로 진행합니다." },
  { number: "3", title: "후보 해석", body: "대표 후보의 질량, 최대 압력, 연소시간, 평균 추력과 판정 이유를 먼저 확인합니다." },
  { number: "4", title: "상세 검토", body: "필요할 때 그래프와 GSRM·AN, RPA, Fusion 영역을 펼쳐 후속 설계 검토에 사용합니다." },
];

const statuses = [
  ["추천", "질량과 압력 등 현재 판정 기준을 만족한 후보입니다.", "text-emerald-700"],
  ["조건부", "일부 조건이 미입력 또는 별도 확인 대상인 후보입니다. 추천과 동일하지 않습니다.", "text-cyan-800"],
  ["참고용 탈락", "추천과 조건부가 모두 없을 때 목표 질량에 가장 가까운 탈락 후보 한 개를 참고로 표시합니다.", "text-violet-800"],
  ["탈락", "하나 이상의 조건을 만족하지 못한 후보입니다. 상세 보기에서 실패 사유를 확인합니다.", "text-rose-700"],
] as const;

export default function GuidePage() {
  return (
    <main className="motorfit-guide min-h-screen px-4 py-6 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-slate-300 pb-7">
          <nav className="flex flex-wrap items-center justify-between gap-3" aria-label="사용 설명서 탐색"><Link href="/" className="text-sm font-semibold text-cyan-800 underline-offset-4 hover:underline">← 계산 화면</Link><Link href="/" className="inline-flex items-center justify-center rounded-md bg-cyan-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-cyan-900">기준 예시로 시작</Link></nav>
          <p className="guide-kicker mt-8">BYPP MotorFit 사용 설명서</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">입력부터 결과 검토까지</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-700">MotorFit은 목표 조건에 맞는 SRM 형상 후보를 계산하고 비교하는 교육·설계 검토 도구입니다. 먼저 대표 결과를 확인한 뒤 필요한 전문 영역만 펼쳐 보세요.</p>
          <p className="mt-4 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950" role="note"><strong>사용 범위:</strong> 기준 모델 재현과 설계 비교를 돕지만 실제 하드웨어 검증, 제작 또는 점화 승인을 대신하지 않습니다.</p>
        </header>

        <section className="mt-8" aria-labelledby="guide-steps"><p className="guide-kicker">빠른 시작</p><h2 id="guide-steps" className="mt-1 text-2xl font-bold text-slate-950">4단계로 사용합니다</h2><ol className="mt-4 divide-y divide-slate-200 border-y border-slate-200 bg-white md:grid md:grid-cols-4 md:divide-x md:divide-y-0">{steps.map((step) => <li key={step.number} className="p-4 sm:p-5"><span className="font-mono text-sm font-bold text-cyan-800">{step.number}</span><h3 className="mt-2 font-bold text-slate-950">{step.title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{step.body}</p></li>)}</ol><div className="mt-4 flex flex-col gap-3 border border-slate-300 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm leading-6 text-slate-700"><strong className="text-slate-950">기준 예시</strong> · 목표 연료 질량 {DEMO_INPUT.targetFuelMassKg.toFixed(4)} kg · 최대 허용 압력 {DEMO_INPUT.maximumPressureMpa.toFixed(1)} MPa · 목표 평균 추력 미입력</p><Link href="/" className="inline-flex shrink-0 items-center justify-center rounded-md bg-cyan-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-cyan-900">계산 화면 열기</Link></div></section>

        <section className="mt-8 grid gap-5 lg:grid-cols-2" aria-label="입력과 판정 안내">
          <article className="guide-panel p-5 sm:p-6"><p className="guide-kicker">입력</p><h2 className="mt-1 text-xl font-bold text-slate-950">무엇을 입력하나요?</h2><dl className="mt-4 divide-y divide-slate-200 text-sm"><div className="py-3"><dt className="font-bold text-slate-950">목표 연료 질량 <span className="font-normal text-slate-500">kg · 필수</span></dt><dd className="mt-1 leading-6 text-slate-600">원하는 추진제 양입니다. 목표보다 무거운 후보는 추천·조건부가 될 수 없습니다.</dd></div><div className="py-3"><dt className="font-bold text-slate-950">최대 허용 압력 <span className="font-normal text-slate-500">MPa · 필수</span></dt><dd className="mt-1 leading-6 text-slate-600">질량 후보의 계산 압력과 비교하는 상한입니다. 질량 자체를 바꾸는 입력은 아닙니다.</dd></div><div className="py-3"><dt className="font-bold text-slate-950">목표 평균 추력 <span className="font-normal text-slate-500">N · 선택</span></dt><dd className="mt-1 leading-6 text-slate-600">비워두면 목표 추력 오차, MSE, 최대 편차, 변동성, 추력 점수를 계산하지 않습니다.</dd></div><div className="py-3"><dt className="font-bold text-slate-950">상세 탐색 범위</dt><dd className="mt-1 leading-6 text-slate-600">Do·do·Lo와 세그먼트 범위를 직접 정할 때 사용합니다. 제작 후보 모드는 5 mm 간격 규칙을 유지합니다.</dd></div></dl></article>
          <article className="guide-panel p-5 sm:p-6"><p className="guide-kicker">결과</p><h2 className="mt-1 text-xl font-bold text-slate-950">후보 상태를 읽는 법</h2><div className="mt-4 divide-y divide-slate-200">{statuses.map(([label, body, tone]) => <div key={label} className="py-3"><h3 className={`text-sm font-bold ${tone}`}>{label}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{body}</p></div>)}</div></article>
        </section>

        <section className="guide-panel mt-5 p-5 sm:p-6" aria-labelledby="search-guide"><p className="guide-kicker">탐색 범위</p><h2 id="search-guide" className="mt-1 text-xl font-bold text-slate-950">자동 확장과 근사 탐색</h2><p className="mt-3 text-sm leading-6 text-slate-700">목표 질량에 맞는 후보가 부족하면 탐색 범위를 단계적으로 넓힙니다. 전체 후보 수와 정밀 계산 수는 구분해 표시합니다. 계산 시간을 관리하기 위해 유망 후보를 정밀 계산하는 근사 탐색이므로 <strong>전역 최적해를 보장하지 않습니다.</strong> 결과의 자동 확장 단계와 실제 탐색 범위를 함께 확인하세요.</p></section>

        <section className="mt-5 grid gap-5 md:grid-cols-2" aria-label="전문 검토 기능"><article className="guide-panel p-5"><h2 className="text-lg font-bold text-slate-950">GSRM·AN 검사</h2><p className="mt-2 text-sm leading-6 text-slate-600"><strong>GSRM</strong>은 선택 후보의 챔버 내경을 오링 검토 기준 직경 B로 변환합니다. <strong>AN 검사</strong>는 241개 오링 규격의 신장률·압축량·압축률·홈 충전율과 백업 링 조건을 비교합니다.</p></article><article className="guide-panel p-5"><h2 className="text-lg font-bold text-slate-950">RPA·Fusion 검토</h2><p className="mt-2 text-sm leading-6 text-slate-600"><strong>RPA</strong>는 Bell형 노즐 상세해석에 전달할 SRM 계산값과 외부 해석 결과를 분리해 관리합니다. <strong>Fusion</strong>은 챔버·노즐·밀봉·스냅링 등 후속 형상 검토에 사용할 요약을 제공합니다. Fusion 파일이나 제작 도면은 자동 생성하지 않습니다.</p></article></section>

        <section className="guide-panel mt-5 p-5 sm:p-6" aria-labelledby="review-order"><p className="guide-kicker">권장 확인 순서</p><h2 id="review-order" className="mt-1 text-xl font-bold text-slate-950">계산 후 무엇을 보나요?</h2><ol className="mt-4 grid gap-4 text-sm leading-6 text-slate-700 sm:grid-cols-3"><li><strong className="block text-slate-950">1. 대표 후보</strong>질량과 압력이 목표·상한 안인지 확인합니다.</li><li><strong className="block text-slate-950">2. 판정 이유와 그래프</strong>조건별 실제값과 기준값, 압력·추력·Kn 변화를 확인합니다.</li><li><strong className="block text-slate-950">3. 전문 검토</strong>필요할 때 GSRM·AN, RPA, Fusion 영역을 펼쳐 후속 검토에 사용합니다.</li></ol></section>

        <section className="mt-5 border border-amber-300 bg-amber-50 p-5 sm:p-6" aria-labelledby="model-limits"><h2 id="model-limits" className="text-xl font-bold text-amber-950">모델 가정과 계산 한계</h2><p className="mt-3 text-sm leading-6 text-amber-950">재료 편차, 제작 공차, 온도, 노즐과 오링의 실제 상태는 자동 검증하지 않습니다. 실제 시험 데이터가 등록되지 않았다면 하드웨어 검증도 확인되지 않은 상태입니다. 결과는 교육·설계 검토용이며 실제 제작·점화 승인용이 아닙니다.</p></section>

        <footer className="mt-8 flex flex-col gap-3 border-t border-slate-300 pt-6 sm:flex-row sm:items-center sm:justify-between"><p className="text-sm text-slate-600">기준 예시로 전체 흐름을 확인한 뒤 실제 입력을 적용하세요.</p><Link href="/" className="inline-flex items-center justify-center rounded-md bg-cyan-800 px-4 py-2.5 text-sm font-bold text-white hover:bg-cyan-900">기준 예시로 계산 화면 열기</Link></footer>
      </div>
    </main>
  );
}
