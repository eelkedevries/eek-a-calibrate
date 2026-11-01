// Peekr's crop renderer for #/lab (discovered by src/app/screens/lab.ts): the
// two 128 × 128 eye crops the model received, as rectangles of the unmirrored
// frame that the screen draws with drawImage, the browser resampling Peekr
// uses. DOM-free.
import type { CropRenderer, LabView } from '../../app/screens/lab.ts';
import { PK_CROP, peekrGeometry } from './preprocess.ts';

const LABELS = ['input1: subject’s left eye', 'input2: subject’s right eye'] as const;

const renderer: CropRenderer = {
  engine: 'peekr',
  render({ result, frame }): LabView[] {
    if (!result.face || result.engines.peekr?.status !== 'ok') return [];
    const geometry = peekrGeometry(result.face.landmarks, frame.width, frame.height);
    if (geometry.status !== 'ok') return [];
    return geometry.crops.map((c, k) => ({ label: LABELS[k], frameRect: { ...c, dw: PK_CROP, dh: PK_CROP } }));
  },
};

export default renderer;
