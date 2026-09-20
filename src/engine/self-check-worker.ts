import { runSelfCheck, SelfCheckCancelledError, type SelfCheckReport } from "./self-check";

type WorkerMessage = { type: "run"; previous?: SelfCheckReport | null } | { type: "cancel" };
let cancelled = false;
const workerScope = self as unknown as { onmessage: ((event: MessageEvent<WorkerMessage>) => void) | null; postMessage: (message: unknown) => void };

workerScope.onmessage = async (event) => {
  if (event.data.type === "cancel") { cancelled = true; return; }
  cancelled = false;
  try {
    const report = await runSelfCheck({ previous: event.data.previous, shouldCancel: () => cancelled, onProgress: (progress) => workerScope.postMessage({ type: "progress", ...progress }) });
    workerScope.postMessage({ type: "result", report });
  } catch (error) {
    if (error instanceof SelfCheckCancelledError) workerScope.postMessage({ type: "cancelled" });
    else workerScope.postMessage({ type: "error", message: error instanceof Error ? error.message : "자체 점검 실행 중 오류" });
  }
};
