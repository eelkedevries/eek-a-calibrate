// The #/lab crop view for BlazeGaze: the 512 × 128 eye strip the encoder
// receives, rebuilt from the frame's landmarks and pixels with the engine's
// own preprocessing. Black where the strip falls outside the frame, as
// upstream. DOM-free (spec §5); the lab screen draws the image.
import type { CropRenderer } from '../../app/screens/lab.ts';
import { pixelLandmarks, planEyeStrip, sampleEyeStrip, STRIP_H, STRIP_W, stripGeometry } from './preprocess.ts';

const renderer: CropRenderer = {
  engine: 'blazegaze',
  render({ result, frame }) {
    const face = result.face;
    if (!face) return [];
    const geometry = stripGeometry(pixelLandmarks(face.landmarks, frame.width, frame.height));
    if (!geometry.ok) return [];
    const plan = planEyeStrip(geometry, frame.width, frame.height);
    const data = sampleEyeStrip(plan, { buffer: frame, x: 0, y: 0 });
    return [{ label: `Eye strip, ${STRIP_W} × ${STRIP_H}, as the encoder receives it`, image: { width: STRIP_W, height: STRIP_H, data } }];
  },
};

export default renderer;
