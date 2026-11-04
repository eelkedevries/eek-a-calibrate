// The game shell (spec §17.2, §17.3): page titles of the new routes, the top bar, the
// placeholder frames and the page-not-found screen. Interface copy has no em dashes (§17.3.6).

export const strings: Readonly<Record<string, string>> = {
  'shell.wordmark': 'eek-a-calibrate',
  'shell.details': 'Details',
  'shell.notFound.title': 'Page not found',
  'shell.notFound.body': 'There is no page at this address.',
  'shell.notFound.home': 'Go to the start',
  'shell.loadError': 'This screen could not be loaded: {message}',
  'shell.placeholder.body': 'This part of the game is not built yet.',
  'shell.placeholder.back': 'Back to the start',

  // Page titles of the routes of §17.2
  'route.title': 'Pop with your eyes',
  'route.ready': 'Get ready',
  'route.warmup': 'Warm-up',
  'route.complete': 'Warm-up complete',
  'route.look': 'Free look',
  'route.challenge': 'Challenge',
  'route.details': 'Details',
  'route.methods': 'Methods',
};
