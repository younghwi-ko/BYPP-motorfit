# MotorFit

MotorFit은 `SRM_2023.xls`의 계산 결과를 웹에서 재현하고 형상 후보를 비교하기 위한 교육용 설계 분석 도구입니다. 원본 Excel 파일은 저장소에 포함하지 않습니다.

현재 1단계는 `Data and Kn`의 다음 범위를 구현합니다.

- 입력과 추진제 상수 검증
- 챔버 및 그레인 기본 형상
- 그레인 부피, 질량, 연소 면적
- 51점 Kn 곡선
- 목 면적과 목 직경

Pressure, blowdown, Performance, 노즐 성능과 후보 탐색 UI는 아직 구현하지 않았습니다.

## Getting Started

의존성을 설치하고 개발 서버를 실행합니다.

```bash
pnpm dev
```

검증 명령은 다음과 같습니다.

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

계산 로직은 `src/engine`에 있으며 UI와 독립적입니다. Excel 재현 검증값은 `tests/fixtures`에만 보관합니다. 제작 후보 검증은 별도 함수로 분리되어 Excel 재현 계산에 영향을 주지 않습니다.
