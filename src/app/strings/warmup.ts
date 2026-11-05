// The warm-up levels (design §2.6–§2.11, §2.16, §7): level cards, the levels' names, rules and
// hints, the stimulus HUD, the pause cards, Checking your aim… and the screen-change card. A
// warm-up line never says or implies that looking pops, moves or scores anything (design §7).

export const strings: Readonly<Record<string, string>> = {
  'warmup.name': 'Warm-up',
  'warmup.heading': 'Warm-up, level {level}: {name}',

  // The levels (design §2.7–§2.11)
  'warmup.level.pop.name': 'Pop the dots',
  'warmup.level.pop.rule': 'Keep your eyes on the dot until the bubble pops.',
  'warmup.level.pop.hint.phone': 'Keep your head and the phone still.',
  'warmup.level.pop.hint.webcam': 'Keep your head still.',
  'warmup.level.follow.name': 'Follow the firefly',
  'warmup.level.follow.rule': 'Follow the firefly with your eyes.',
  'warmup.level.follow.hint.phone': 'Keep your head and the phone still.',
  'warmup.level.follow.hint.webcam': 'Keep your head still.',
  'warmup.level.turn.name': 'Turn your head',
  'warmup.level.turn.rule': 'Keep your eyes on the dot and slowly turn your head.',
  'warmup.level.turn.hint.phone': 'Keep the phone still. Fill the arcs.',
  'warmup.level.turn.hint.webcam': 'Fill the arcs around the bubble.',
  'warmup.level.lean.name': 'Lean in',
  'warmup.level.lean.rule': "Lean in by about a hand's width, then pop the dots again.",
  'warmup.level.lean.hint.phone': 'Keep your head and the phone still.',
  'warmup.level.lean.hint.webcam': 'Keep your head still.',
  'warmup.level.test.name': 'Test round',
  'warmup.level.test.rule': 'Same as level 1. This round checks your aim.',
  'warmup.level.test.hint.phone': 'Keep your head and the phone still.',
  'warmup.level.test.hint.webcam': 'Keep your head still.',

  // Level cards (design §2.6)
  'warmup.card.levelOf': 'Level {level} of {levels}',
  'warmup.card.clear': 'Level {level} clear · {line}',
  'warmup.card.steady': 'Nice and steady',
  'warmup.card.still': 'Try to keep your head still',
  'warmup.card.view': 'Try to stay in view',
  'warmup.card.nice': 'Nice work',
  'warmup.card.startNow': 'Start now',
  'warmup.card.startsIn': 'Starts in {seconds} seconds',
  'warmup.card.startsIn1': 'Starts in 1 second',
  'warmup.card.skip': 'Skip this level',
  'warmup.card.sound': 'Sound',

  // Turn your head's caption chip (design §2.9)
  'warmup.head.turn': 'Slowly turn your head',
  'warmup.head.nod': 'Now nod slowly',

  // The HUD (design §2.6)
  'warmup.progress': 'Level {level} progress',
  'warmup.pause': 'Pause',

  // Pausing (design §2.6, §3.8)
  'warmup.paused.title': 'Paused',
  'warmup.paused.carryOn': 'Carry on',
  'warmup.paused.exit': 'Exit',
  'warmup.paused.details': 'Details',
  'warmup.paused.getReady': 'Get ready again',
  'warmup.fix.title': "Let's fix the set-up first",
  'warmup.fix.body': 'The warm-up paused three times in this level.',
  'warmup.fix.action': 'Get ready again',

  // Checking your aim (design §2.10)
  'warmup.checking.title': 'Checking your aim…',
  'warmup.checking.late': 'Almost there',
  'warmup.checking.progress': 'Checking progress',

  // Screen changes and failures (design §2.16)
  'warmup.changed.title': 'The screen changed',
  'warmup.changed.body': 'Warm up again to keep playing.',
  'warmup.changed.rotated': 'Turn the phone back, or warm up again',
  'warmup.changed.action': 'Warm up again',
  'warmup.failed.title': "The warm-up couldn't finish",
  'warmup.failed.noFrames': 'We could not see your face well enough.',
  'warmup.failed.fit': 'The tracker could not be set up.',
  'warmup.failed.camera': 'The camera stopped.',
  'warmup.failed.action': 'Get ready again',
};
