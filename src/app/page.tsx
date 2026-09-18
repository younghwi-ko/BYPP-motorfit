export default function Home() {
  const implemented = [
    "입력 검증과 추진제 상수 선택",
    "챔버·그레인 기본 형상",
    "그레인 부피·질량과 연소 면적",
    "51점 Kn 곡선",
    "목 면적과 목 직경",
  ];

  const planned = [
    "Pressure와 연소 시간",
    "Blowdown",
    "Performance와 노즐 성능",
    "형상 후보 자동 비교",
  ];

  return (
    <main className="min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-10 sm:px-10 lg:px-14">
        <header className="flex items-center justify-between border-b border-slate-200 pb-5">
          <div>
            <p className="text-xs font-semibold tracking-[0.24em] text-sky-700 uppercase">
              MotorFit · Phase 1
            </p>
            <p className="mt-1 text-sm text-slate-500">교육용 설계 분석 시뮬레이터</p>
          </div>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
            Data and Kn 구현
          </span>
        </header>

        <div className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="mb-5 inline-flex rounded-full bg-sky-50 px-3 py-1 text-sm font-medium text-sky-800">
              SRM_2023.xls 계산식 포팅
            </p>
            <h1 className="max-w-3xl text-4xl leading-tight font-semibold tracking-[-0.04em] text-slate-950 sm:text-6xl">
              형상 계산을 검증 가능한 코드로 옮깁니다.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">
              MotorFit은 원본 Excel의 계산 순서, 단위와 상수를 보존해 설계 결과를
              비교하는 웹 도구입니다. 현재 단계는 그레인 형상과 Kn 계산 범위에
              한정됩니다.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-950">Excel 재현 모드</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  원본과 같은 소수 mm 입력을 허용하며 제작 단위 제약을 적용하지
                  않습니다.
                </p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p className="text-sm font-semibold text-slate-950">후보 탐색 준비</p>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  정수 mm와 기본 5 mm 간격 검증을 별도 모듈로 준비했습니다.
                </p>
              </div>
            </div>
          </div>

          <aside className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_24px_70px_-36px_rgba(15,23,42,0.35)] sm:p-8">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">
                Implemented
              </p>
              <ul className="mt-4 space-y-3">
                {implemented.map((item) => (
                  <li key={item} className="flex gap-3 text-sm text-slate-700">
                    <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800">
                      ✓
                    </span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>

            <div className="my-7 h-px bg-slate-100" />

            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-slate-500 uppercase">
                Next
              </p>
              <ul className="mt-4 space-y-3">
                {planned.map((item) => (
                  <li key={item} className="flex gap-3 text-sm text-slate-500">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-slate-300" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>

        <footer className="border-t border-slate-200 pt-5 text-sm text-slate-500">
          학습과 설계 검토를 위한 계산 도구입니다. 제작·점화 절차는 다루지 않습니다.
        </footer>
      </section>
    </main>
  );
}
