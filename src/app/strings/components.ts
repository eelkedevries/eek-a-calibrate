// Shared v1 setup components: banners, download progress, storage.

export const strings: Readonly<Record<string, string>> = {
  // Shared setup components (WP9): banners, download progress, storage
  'banner.info': 'Note:',
  'banner.ok': 'Done:',
  'banner.warn': 'Warning:',
  'banner.error': 'Problem:',
  'banner.dismiss': 'Dismiss',
  'progress.of': '{loaded} of {total} MB ({percent} %)',
  'progress.loaded': '{loaded} MB',
  'progress.done': 'done',

  // Names of what the vision host downloads (its progress messages name the face model or an engine).
  'progress.asset.face-landmarker': 'Face landmark model',
  'progress.asset.blazegaze': 'BlazeGaze',
  'progress.asset.peekr': 'Peekr',
  'progress.asset.geometric': 'Geometric',
  'progress.asset.eyepixel': 'Eye-pixel (WebGazer method)',
  'storage.memory': 'This browser does not let eek-a-calibrate store data, so measurements and calibrations are kept for this visit only.',
};
