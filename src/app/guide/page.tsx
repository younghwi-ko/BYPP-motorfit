import Link from "next/link";
import { DEMO_INPUT } from "../demo-config";

const steps = [
  { title: "1. 입력하기", body: "목표 질량(연료가 되길 바라는 양)과 최대 허용 압력을 입력하세요. 목표 평균 추력은 알고 있을 때만 입력하면 됩니다." },
  { title: "2. 순서대로 계산하기", body: "질량 기준 계산 → 압력 조건 적용 → 최종 추천 계산 순서로 버튼을 누르면 탐색 범위가 점점 좁혀집니다." },
  { title: "3. 결과 읽기", body: "추천 후보를 먼저 보고, 질량·압력·추력·연소시간이 목표와 얼마나 가까운지 비교하세요. 선택 후보에서 그래프와 GSRM 검사를 확인할 수 있습니다." },
];

const terms = [
  ["질량", "계산된 추진제 질량입니다. 목표값 이하이면서 허용 오차 안에 있는 후보를 우선합니다."],
  ["압력", "연소 중 예상되는 최대 챔버 압력입니다. 입력한 최대 허용 압력을 넘지 않아야 합니다."],
  ["추력", "모터가 내는 힘(N)입니다. 목표 추력을 입력하면 추력 곡선 오차도 함께 비교합니다."],
  ["연소시간", "추력이 발생하는 예상 시간(s)입니다. 후보 간 연소 특성을 비교하는 데 사용합니다."],
  ["Kn", "연소면적과 노즐 목 면적의 비율입니다. 시간에 따른 압력·추력 변화 그래프에서 확인합니다."],
];

export default function GuidePage() {
  return (
    <main className="min-h-screen px-4 py-6 text-slate-950 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-5xl">
        <header className="rounded-3xl border border-cyan-200 bg-white p-6 shadow-sm sm:p-10">
          <Link href="/" className="inline-flex rounded-lg px-2 py-1 text-sm font-bold text-cyan-800 underline-offset-4 hover:underline focus:outline-none focus:ring-2 focus:ring-cyan-500">← 계산 화면으로 돌아가기</Link>
          <p className="mt-8 text-xs font-bold uppercase tracking-[0.24em] text-cyan-700">MotorFit · 초보자 안내</p>
          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">처음이라면, 이 순서로 보세요.</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-slate-700 sm:text-lg">MotorFit은 목표에 가까우면서 압력 조건을 지키는 그레인 형상을 찾아 비교하는 교육용 설계 검토 도구입니다. 계산 결과는 답 하나가 아니라, 설계 선택을 이해하기 위한 근거로 사용하세요.</p>
          <div className="mt-6 rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-4 text-sm font-semibold leading-6 text-amber-950" role="note"><strong>중요:</strong> 실제 제작·점화용 절차나 안전 승인을 대신하지 않습니다. 실제 설계에는 자격 있는 전문가의 검토와 별도 안전 검증이 필요합니다.</div>
        </header>

        <section className="mt-6" aria-labelledby="quick-start">
          <div className="flex items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-700">Quick start</p><h2 id="quick-start" className="mt-1 text-2xl font-black">3단계 빠른 시작</h2></div><Link href="/" className="hidden rounded-xl bg-cyan-700 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-800 focus:outline-none focus:ring-2 focus:ring-cyan-500 sm:inline-flex">계산 시작하기</Link></div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">{steps.map((step) => <article key={step.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="text-lg font-black text-slate-950">{step.title}</h3><p className="mt-3 text-sm leading-6 text-slate-700">{step.body}</p></article>)}</div>
          <div className="mt-4 rounded-2xl border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm leading-6 text-cyan-950"><strong>기본 예시:</strong> 목표 질량 <b>{DEMO_INPUT.targetFuelMassKg.toFixed(4)} kg</b> · 최대 허용 압력 <b>{DEMO_INPUT.maximumPressureMpa.toFixed(1)} MPa</b> · 목표 평균 추력 <b>미입력</b>. 질량은 원하는 추진제 양, 압력은 넘지 않아야 할 상한, 추력은 알고 있을 때만 비교할 힘을 뜻합니다.</div>
        </section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2" aria-label="입력과 결과 설명">
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-black">무엇을 입력하나요?</h2><ul className="mt-4 space-y-3 text-sm leading-6 text-slate-700"><li><b className="text-slate-950">목표 질량:</b> 원하는 연료 질량입니다. 질량이 클수록 더 큰 형상이나 탐색 확장이 필요할 수 있습니다.</li><li><b className="text-slate-950">최대 허용 압력:</b> 후보가 이 값을 넘으면 추천이 될 수 없습니다.</li><li><b className="text-slate-950">목표 평균 추력:</b> 선택 입력입니다. 비워두면 MSE·최대 편차·추력 변동성·추력 점수를 계산하지 않습니다.</li><li><b className="text-slate-950">상세 범위:</b> 제작 후보 모드는 기본 5 mm 간격을 사용합니다. 범위를 좁히면 계산과 비교가 쉬워집니다.</li></ul></article>
          <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h2 className="text-xl font-black">결과를 어떻게 읽나요?</h2><div className="mt-4 space-y-3 text-sm leading-6 text-slate-700"><p><b className="text-emerald-700">추천:</b> 현재 기준에서 질량·압력 등 핵심 조건을 함께 만족하는 후보입니다.</p><p><b className="text-cyan-800">조건부:</b> 일부 선택 조건이 미입력 또는 별도 판정 대상이라 확정 추천이 아닌 후보입니다.</p><p><b className="text-violet-800">참고용 탈락:</b> 추천 후보가 없을 때 목표 질량에 가장 가까운 탈락 후보를 참고로 보여줍니다.</p><p><b className="text-amber-800">탈락:</b> 하나 이상의 조건을 만족하지 못한 후보입니다. 행을 열어 판정 사유를 확인하세요.</p></div></article>
        </section>

        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" aria-labelledby="terms"><h2 id="terms" className="text-xl font-black">숫자와 전문 용어</h2><div className="mt-4 grid gap-3 sm:grid-cols-2">{terms.map(([term, description]) => <div key={term} className="rounded-xl bg-slate-50 p-4"><h3 className="font-black text-slate-950">{term}</h3><p className="mt-1 text-sm leading-6 text-slate-700">{description}</p></div>)}</div></section>

        <section className="mt-6 grid gap-6 lg:grid-cols-2" aria-label="탐색과 GSRM 안내">
          <article className="rounded-2xl border border-violet-200 bg-violet-50 p-6"><h2 className="text-xl font-black text-violet-950">자동 확장과 근사 탐색</h2><p className="mt-3 text-sm leading-6 text-violet-950">목표 질량이 크면 MotorFit이 탐색 범위를 자동으로 넓힙니다. 계산 시간을 관리하기 위해 전체 조합 중 유망한 일부를 정밀 계산하므로, 화면의 경고처럼 <b>전역 최적해를 보장하지 않습니다.</b> 자동 확장 단계·현재 범위·정밀 계산 수를 함께 보고 결과의 범위를 이해하세요.</p></article>
          <article className="rounded-2xl border border-cyan-200 bg-cyan-50 p-6"><h2 className="text-xl font-black text-cyan-950">GSRM과 AN 오링 검사</h2><p className="mt-3 text-sm leading-6 text-cyan-950">선택한 SRM 후보의 챔버 내경을 GSRM 기준 직경 B로 변환한 뒤, AN 카탈로그 241개 규격을 기하학적 Engineering Check로 검사합니다. 신장률·압축량·압축률·홈 충전율과 백업 링 조건을 설계 검토 참고값으로 확인하세요.</p></article>
        </section>

        <section className="mt-6 rounded-2xl border-2 border-cyan-300 bg-white p-6 shadow-sm" aria-labelledby="next"><h2 id="next" className="text-xl font-black">계산이 끝난 뒤 할 일</h2><ol className="mt-4 grid gap-3 text-sm leading-6 text-slate-700 sm:grid-cols-3"><li><b className="text-slate-950">1.</b> 추천 후보의 질량과 최대 압력이 목표·상한 안인지 확인합니다.</li><li><b className="text-slate-950">2.</b> 후보를 비교하고 그래프에서 압력·추력·Kn 변화가 어떻게 달라지는지 봅니다.</li><li><b className="text-slate-950">3.</b> GSRM/AN 결과와 판정 사유를 기록하고, 필요하면 범위를 조정해 다시 계산합니다.</li></ol><Link href="/" className="mt-6 inline-flex w-full items-center justify-center rounded-xl bg-cyan-700 px-4 py-3 text-sm font-black text-white hover:bg-cyan-800 focus:outline-none focus:ring-2 focus:ring-cyan-500 sm:w-auto">예시 입력으로 계산 화면 열기</Link></section>
      </div>
    </main>
  );
}
