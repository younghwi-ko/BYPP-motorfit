import { CandidateSearchCancelledError, CandidateSearchInputError, createAutomaticCandidateSearchConfig, createExcelRangeSearchConfig, estimateCandidateCount, searchCandidatesAsync } from "./candidate-search";
import type { CandidateSearchConfig } from "./types";

type WorkerMessage = { type: "run"; config: CandidateSearchConfig; mode: "candidate" | "excel"; automaticMode: boolean; batchSize: number } | { type: "cancel" };
let cancelled = false;
const workerScope = self as unknown as { onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null; postMessage: (message: unknown) => void };

workerScope.onmessage = async (event) => {
  if (event.data.type === "cancel") { cancelled = true; return; }
  cancelled = false;
  try {
    const baseConfig = event.data.config;
    const runConfig: CandidateSearchConfig = event.data.mode === "excel" ? createExcelRangeSearchConfig(baseConfig) : event.data.automaticMode ? createAutomaticCandidateSearchConfig(baseConfig) : { ...baseConfig, rangeSource: "manual", searchOrder: "range", automaticExpansionStage: 0, maxCandidateCount: Number.MAX_SAFE_INTEGER };
    const totalCandidates = estimateCandidateCount(runConfig);
    workerScope.postMessage({ type: "prepared", totalCandidates, plannedPrecision: Math.min(totalCandidates, runConfig.maxCandidateCount ?? totalCandidates) });
    const result = await searchCandidatesAsync(runConfig, { batchSize: event.data.batchSize, shouldCancel: () => cancelled, onProgress: (progress) => workerScope.postMessage({ type: "progress", ...progress }) });
    const passedIndices = result.passedCandidates.map((candidate) => result.candidates.indexOf(candidate));
    const nearestRejectedIndex = result.nearestRejectedCandidate ? result.candidates.indexOf(result.nearestRejectedCandidate) : -1;
    const { candidates: _candidates, passedCandidates: _passedCandidates, nearestRejectedCandidate: _nearestRejectedCandidate, ...summary } = result;
    void _candidates;
    void _passedCandidates;
    void _nearestRejectedCandidate;
    workerScope.postMessage({ type: "result-start", summary, passedIndices, nearestRejectedIndex });
    // Transfer candidate results in bounded batches. This keeps the calculation
    // result identical while avoiding hundreds of thousands of individual
    // postMessage callbacks for deliberately broad performance-test ranges.
    const transferBatchSize = 1000;
    for (let index = 0; index < result.candidates.length; index += transferBatchSize) {
      workerScope.postMessage({ type: "candidate-batch", candidates: result.candidates.slice(index, index + transferBatchSize) });
    }
    workerScope.postMessage({ type: "result-end" });
  } catch (error) {
    if (error instanceof CandidateSearchCancelledError) workerScope.postMessage({ type: "cancelled" });
    else if (error instanceof CandidateSearchInputError) workerScope.postMessage({ type: "input-error", issues: error.issues });
    else workerScope.postMessage({ type: "error", message: error instanceof Error ? error.message : "unknown" });
  }
};
