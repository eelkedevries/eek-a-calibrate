// Details → About (design §2.17; spec §17.2.1, Appendix B). The engines' licences, citations and
// published evidence are the v1 About page's (strings/about.ts), shared with Methods.

export const strings: Readonly<Record<string, string>> = {
  'details.about.title': 'About the game',
  'details.about.1': 'Pop with your eyes warms up an eye tracker on your own camera, then lets you play with it.',
  'details.about.2': 'In the warm-up you look at dots while the tracker learns how your eyes move; the Test round checks how well it learnt.',
  'details.about.3': 'The screen zones it can tell apart become the board of the challenge, where your eyes pop the bubbles.',

  'details.about.privacy.title': 'Privacy',
  'details.about.privacy.line': 'Everything runs on this device. Nothing is uploaded and no images are stored.',
  'details.about.privacy.stored': 'The browser keeps your settings, best scores, screen and distance measurements, up to eight warm-ups (numbers, never pictures) and the session summaries you save.',
  'details.about.privacy.export': 'An export is a file you download; what happens to it then is up to you.',

  'details.about.expect.title': 'What to expect',
  'details.about.expect.line': 'In good conditions webcam eye tracking is about 2–4° of visual angle off target, often 4–8° or worse. It samples at most about 30 times a second and tells apart only a few large areas.',
  'details.about.expect.own': 'This app quotes no accuracy figure of its own: your Test round is the figure that counts for you.',
  'details.about.expect.sources': 'Sources: Papoutsaki et al. (2016); Semmelmann and Weigelt (2018); Yang and Krajbich (2021); Kaduk et al. (2024); Bogdan et al. (2024); Van der Cruyssen et al. (2024); Chen and Brat (2026).',

  'details.about.advised.title': 'Advised distances',
  'details.about.engine.licence': 'Licence: {licence}.',
  'details.about.engine.version': 'Version {version}.',
  'details.about.engine.citation': 'Citation: {citation}',
  'details.about.engine.evidence': 'Published evidence: {evidence}',
  'details.about.frontend.title': 'Face landmarks',
  'details.about.methods.title': 'Methods',
  'details.about.methods.body': 'The long read: how the tracker is warmed up and tested, the formulae behind every number, the engines and the limits.',
  'details.about.methods.open': 'Methods (long read)',
};
