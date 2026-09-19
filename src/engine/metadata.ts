export const APP_VERSION = "0.1.0";
export const CALCULATION_ENGINE_VERSION = "candidate-search-1";
export const BASELINE_VERSION = "SRM_2023.xls-baseline";
export const GSRM_REFERENCE_VERSION = "GSRM-engineering-targets-v1";
export const AN_CATALOG_VERSION = "AS568A-supplied-catalog";
export const AN_CATALOG_ITEM_COUNT = 241;

export const MODEL_VALIDATION_LEVEL = "기준 모델 재현·계산 재현성 확인";
export const BASELINE_REPRODUCTION_STATUS = "확인됨";
export const DETERMINISTIC_CALCULATION_STATUS = "확인됨";
export const HARDWARE_VALIDATION_STATUS = "확인되지 않음";
export const PRODUCTION_APPROVAL_STATUS = "제공하지 않음";
export const VALIDATION_DATA_AVAILABLE = false;
export const MODEL_ASSUMPTIONS = [
  "사용자가 입력한 조건과 앱 내부 기본값을 구분하여 계산합니다.",
  "목표 추력이 미입력인 경우 MSE·최대 편차·추력 변동성·추력 점수를 계산하지 않습니다.",
  "자동 탐색은 전역 최적해를 보장하지 않는 근사 탐색입니다.",
];
export const MODEL_LIMITATIONS = [
  "재료 편차·제작 편차·온도·노즐 상태·오링 상태를 자동 검증하지 않습니다.",
  "실제 제작품 또는 시험 데이터가 등록되어 있지 않습니다.",
  "교육·설계 검토용이며 실제 제작·점화 승인용이 아닙니다.",
];
