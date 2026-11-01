// The fit worker (specification §4.2, §5): the pure calibration fit off the main thread. It
// imports core/ and engines/mappers.ts only, never a runtime, TF.js or ONNX Runtime.
import { fitCalibration } from '../core/calibration/fitEngine.ts';
import { MAPPERS } from '../engines/mappers.ts';
import type { FitRequest, FitResponse } from './fitClient.ts';

const scope = self as unknown as Worker;

scope.onmessage = (event: MessageEvent<FitRequest>) => {
  const { id, recs, opts } = event.data;
  const post = (message: FitResponse): void => scope.postMessage(message);
  try {
    const result = fitCalibration(recs, { ...opts, mappers: MAPPERS }, (stage, fraction) => post({ t: 'progress', id, stage, fraction }));
    post({ t: 'result', id, result });
  } catch (error) {
    post({ t: 'error', id, message: error instanceof Error ? error.message : String(error) });
  }
};
