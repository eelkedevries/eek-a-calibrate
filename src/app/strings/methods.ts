// Methods, the long read (#/methods, a document page). Its sections are the copy of strings/about.ts,
// shared with Details → About, plus how the game presents the protocol (spec §17.6–§17.9; every
// threshold heuristic).

export const strings: Readonly<Record<string, string>> = {
  'methods.title': 'Methods',
  'methods.lead': 'How eek-a-calibrate measures, what it can and cannot tell you, the engines it uses with their licences and citations, and what happens to your data.',
  'methods.back': 'Back to the game',
  'methods.nav': 'Leave the methods',
  'methods.game.title': 'From warm-up to game',
  'methods.game.1': 'The warm-up levels are the calibration: Pop the dots shows the fixation dots, Follow the firefly the moving dot, Turn your head the guided head movement, and the Test round the validation dots, which are never used for calibration. Quick has Pop the dots (9 dots) and a Test round of 6; Thorough adds Lean in, the 13 dots again while sitting closer.',
  'methods.game.2': 'Warm-up bubbles pop on a timer: they shrink while frames are sampled, whatever the eyes do. Looking only pops bubbles in the challenge.',
  'methods.game.3': 'Stars come from the Test round’s verdict for the estimator in use: good gives 3, acceptable 2, poor 1, and not tracking 0. Zones are chosen across and down separately: the most columns or rows, up to 4, whose half-width is at least the 75th-percentile accuracy plus twice the sample-to-sample precision. Two zones unlock the challenge. Both rules are heuristic.',
  'methods.game.4': 'In the challenge a bubble shrinks while the filtered, drift-corrected gaze lies in its zone, and recovers when it leaves. A round earns one star at half the bubbles popped, two at three quarters and three at nine in ten with a median time to pop of 1.6 s or less (heuristic). The best score is kept per set of zones.',
};
