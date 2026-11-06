// The export and the stored data (spec §4.15, §4.16, §15.2.2, §17.10), shown in Details → Data.

export const strings: Readonly<Record<string, string>> = {
  'data.export.noFit': 'There is nothing to export yet: play the warm-up first.',
  'data.export.noRef': 'Export becomes available once the warm-up has set the viewing distance.',
  'data.export.failed': 'The export failed: {message}',
  'data.profile.summary': 'Validation of {name}: {accuracy} ({verdict}).',
  'data.sessions.stored': 'The session summary is stored on this device.',
  'data.sessions.storeFailed': 'The session could not be stored: {message}',
  'data.readme.title': 'Notes on this export',
  'data.readme.approximate': 'Degree values are approximate: the screen size or the viewing distance was not measured, so 96 CSS px per inch and a 60° camera field of view across the long side of the video were assumed. Pixel values do not depend on this.',
  'data.readme.markers': 'markers.csv lists the markers set during Expert mode recordings in Free look: trial, marker number and time_ms.',
  'data.readme.filtered': 'gaze_x_filt and gaze_y_filt are the One Euro filtered positions shown in Free look, on rows of live recordings only; every other gaze column is unfiltered.',
  'data.readme.omitted': 'Left out: {file} ({reason}).',
  'data.readme.noSd2d': 'no validation with valid samples was available to set the I-DT dispersion threshold, so no events could be detected',
  'data.readme.eventsBlock': 'No events for {trial}: {reason}.',
  'data.readme.noAssets': 'The asset hash table could not be read ({reason}).',
};
