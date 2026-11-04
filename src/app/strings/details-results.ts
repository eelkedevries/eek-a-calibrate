// Details → Results (design §2.17, §2.12, §5.5; spec §17.7, §17.9.5, §4.12). Thresholds are
// heuristic and say so; numbers about webcam eye tracking carry their sources (Appendix B).

export const strings: Readonly<Record<string, string>> = {
  'details.results.unit.deg': '{value}°',
  'details.results.unit.approxDeg': '≈ {value}°',
  'details.results.unit.pct': '{value} %',
  'details.results.unit.hz': '{value} Hz',
  'details.results.unit.ms': '{value} ms',
  'details.results.unit.s': '{value} s',
  'details.results.verdict.good': 'Good',
  'details.results.verdict.acceptable': 'Acceptable',
  'details.results.verdict.poor': 'Poor',
  'details.results.verdict.not-tracking': 'Not tracking',

  'details.results.card.auto': 'Auto’s choice',
  'details.results.card.verdict': 'Verdict',
  'details.results.card.accuracy': 'Accuracy',
  'details.results.card.accuracyPx': '{px} px · {pct} % of diagonal',
  'details.results.card.precision': 'Precision',
  'details.results.card.loss': 'Data loss',
  'details.results.card.rate': 'Rate',
  'details.results.card.use': 'Use this',
  'details.results.card.inUse': 'In use. Switch off to go back to Auto’s choice.',
  'details.results.card.inUseAuto': 'In use, as Auto chose.',
  'details.results.card.reason': 'Why Auto chose it: {reason}',
  'details.results.card.notFitted': 'Not fitted in this warm-up.',
  'details.results.missing.combined': 'Not formed in this warm-up: it needs two engines that fit well enough.',
  'details.results.missing.unavailable': 'Unavailable on this device: {reason}.',
  'details.results.missing.notFitted': 'Not fitted in this warm-up.',

  'details.results.none.title': 'Results',
  'details.results.none.body': 'No results yet. Play the warm-up: its Test round shows how well the tracker follows your eyes.',
  'details.results.none.untested': 'The warm-up in use has not been tested yet. A Test round shows how well it works.',

  'details.results.plot.title': 'Target plot',
  'details.results.plot.show': 'Show {name}',
  'details.results.plot.note': 'Crosses are the Test round’s targets; dots are the gaze samples, the larger dot their mean.',

  'details.results.judge.title': 'How we judge this',
  'details.results.judge.intro': 'Stars come from the Test round’s verdict for the estimator in use, by these heuristic rules of thumb:',
  'details.results.judge.good': 'Good: off by at most {deg}° on average, with at most {loss} % data loss.',
  'details.results.judge.acceptable': 'Acceptable: at most {deg}°, with at most {loss} % data loss.',
  'details.results.judge.poor': 'Poor: tracking, but less accurate than that.',
  'details.results.judge.none': 'No stars: less than {gain} times better than always guessing the middle, or fewer than two zones.',
  'details.results.judge.approx': 'While the screen and distance are not measured, the limits are {good} % and {ok} % of the screen diagonal.',
  'details.results.judge.zones': 'Zones: across and down separately, the most columns or rows (up to 4) whose half-width is at least the 75th-percentile error plus twice the sample-to-sample spread. Two zones unlock the challenge.',
  'details.results.judge.challenge': 'Each challenge round: one star for half the bubbles popped, two for three quarters, three for nine in ten with a median time to pop of 1.6 s or less.',
  'details.results.judge.heuristic': 'Every threshold here is heuristic: a rule of thumb, not a value derived from evidence.',
  'details.results.judge.sources': 'For scale: in good conditions webcam eye tracking is about 2–4° off target, often 4–8° or worse, and suits a few large areas only (Papoutsaki et al. 2016; Semmelmann and Weigelt 2018; Yang and Krajbich 2021; Kaduk et al. 2024; Bogdan et al. 2024; Van der Cruyssen et al. 2024).',

  'details.results.challenge.title': 'Challenge by zone',
  'details.results.challenge.none': 'Play the challenge to see how each zone did.',
  'details.results.challenge.intro': '{rounds} round(s) on {cols} × {rows} zones.',
  'details.results.challenge.zone': 'Column {col}, row {row}',
  'details.results.challenge.hits': '{popped} of {bubbles} popped ({pct} %)',
  'details.results.challenge.timing': 'Median {s} s · offset {x}, {y} px',

  'details.results.modes.title': 'Own and shared frames',
  'details.results.modes.note': 'Own: each estimator’s own valid frames. Shared: only frames valid for every estimator, which makes the rows comparable.',
  'details.results.modes.own': 'Own: {value}',
  'details.results.modes.both': 'Shared: {value}',

  'details.results.funnel.title': 'Where the frames went',
  'details.results.funnel.for': 'Test round, {name}, over every target.',

  'details.results.cv.title': 'Cross-validation',
  'details.results.cv.chosen': 'chosen',
  'details.results.cv.detail': 'λ {lambda} · {rows} rows · {coverage} % coverage',

  'details.results.paired.title': 'Paired differences',
  'details.results.paired.note': 'Accuracy differences target by target, with a Wilcoxon signed-rank test.',
  'details.results.paired.none': 'Only one estimator has a Test round result.',
  'details.results.paired.pair': '{a} against {b}',
  'details.results.paired.mean': 'Mean difference {value}',
  'details.results.paired.test': 'p = {p}, n = {n}',

  'details.results.aoi.title': 'Areas of interest',
  'details.results.aoi.note': 'Heuristic: half a cell must be at least the 75th-percentile error plus twice the sample-to-sample spread. Published studies support at most about 4–6 areas (Yang and Krajbich 2021; Van der Cruyssen et al. 2024).',

  'details.results.fit.title': 'Notes from the fit',
  'details.results.fit.estimator': 'In use',
  'details.results.fit.lag': 'Pursuit lag',
  'details.results.fit.time': 'Fitting took',

  'details.results.degrees.title': 'Degrees',
  'details.results.degrees.approx': 'Degree values are approximate (≈): 96 CSS px per inch and a typical camera field of view are assumed. Pixels and percentages of the diagonal are exact; measuring makes degrees exact too.',
  'details.results.degrees.exact': 'Degree values are exact: the screen and the viewing distance were measured.',
};
