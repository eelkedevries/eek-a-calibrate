// Get ready, the ready check (design §2.5, §2.16, §7). The cues themselves are in guard.ts.

export const strings: Readonly<Record<string, string>> = {
  'ready.name': 'Get ready',
  'ready.start': 'Start warm-up',
  'ready.anyway': 'Start anyway',
  'ready.anywayNote': 'You may unlock fewer zones',
  'ready.larger': 'Make the window larger to play',
  'ready.slow': 'This device is slow. Close other apps.',
  'ready.mismatch': 'This camera needs a full warm-up',
  'ready.tapAnywhere': 'Tap anywhere to start',
  'ready.ended': 'The camera stopped',
  'ready.failed': 'The game could not start: {message}',
  'ready.retry': 'Reload the page to try again',
};
