// Details → Data (design §2.17; spec §4.15, §4.16, §17.10).

export const strings: Readonly<Record<string, string>> = {
  'details.data.export.title': 'Export',
  'details.data.export.body': 'A zip of every frame’s gaze, the targets, the results and a description of the session, for analysis. README.txt explains the files.',
  'details.data.export.dataset': 'Include per-frame features',
  'details.data.export.datasetNote': 'dataset.json, for refitting. No images, no landmarks.',
  'details.data.export.button': 'Export zip',
  'details.data.export.noFit': 'There is nothing to export yet: play the warm-up first.',
  'details.data.export.working': 'Building the zip…',
  'details.data.export.done': 'Exported {n} files.',
  'details.data.export.omitted': 'Left out: {files}; README.txt says why.',
  'details.data.save.button': 'Save summary',

  'details.data.saved.title': 'Saved on this device',
  'details.data.saved.warmup': 'Warm-up, {date}',
  'details.data.saved.who': 'Participant {pid} · session {session}',
  'details.data.saved.session': 'Session summary, {date}',
  'details.data.saved.sessionWhat': '{name} · {verdict}',
  'details.data.saved.withDataset': 'With per-frame features',
  'details.data.saved.summaryOnly': 'Summary only',
  'details.data.saved.score': 'Best score, {cols} × {rows} zones',
  'details.data.saved.scoreWhat': '{score} · {stars} stars · {date}',
  'details.data.saved.none': 'Nothing is saved on this device.',
  'details.data.saved.note': '“Delete all my data”, below, removes all of it.',

  'details.data.ids.title': 'Participant and session',
  'details.data.ids.pid': 'Participant',
  'details.data.ids.session': 'Session',
  'details.data.ids.note': 'Optional labels for the export. They stay on this device.',
  'details.data.ids.locked': 'Set before a warm-up; this one keeps the labels it started with.',
};
