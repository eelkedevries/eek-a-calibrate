// Warm-up complete (design §2.12, §7): the outcome's headline, sentence and tip, the zone map and
// its legend, the stars and the actions. Every line states a measured fact or a rule of thumb;
// none credits the eyes with popping anything (design §7).

export const strings: Readonly<Record<string, string>> = {
  'complete.name': 'Warm-up complete',

  // Headlines and sentences (the outcome table of design §2.12)
  'complete.headline.zones': 'You unlocked {n} zones',
  'complete.headline.failed': "Warm-up didn't work",
  'complete.headline.restore': 'Your saved warm-up no longer fits',
  'complete.sentence.zones': 'The challenge will use these {n} zones.',
  'complete.sentence.leftRight': 'Only left and right for now.',
  'complete.sentence.topBottom': 'Only top and bottom for now.',
  'complete.sentence.more': 'Warming up again may unlock more.',
  'complete.sentence.failed.face-lost': 'We often lost your face.',
  'complete.sentence.failed.backlit': 'The light behind you was too bright.',
  'complete.sentence.failed.dark': 'It was too dark to see your eyes.',
  'complete.sentence.failed.motion': 'Your head moved a lot.',
  'complete.sentence.failed.glare': 'Glare hid your eyes.',
  'complete.sentence.failed.far': 'You were too far from the camera.',
  'complete.sentence.failed.none': 'The tracker could not follow your eyes.',
  'complete.sentence.restore': 'Warm up in full to play the challenge.',

  // Tips: the cause line (design §2.12), phone and webcam where they differ
  'complete.tip.great': 'Your set-up works well.',
  'complete.tip.none': 'Steady light and a still head help most.',
  'complete.tip.face-lost.phone': 'Prop the phone up and stay in view.',
  'complete.tip.face-lost.webcam': 'Sit facing the camera and stay in view.',
  'complete.tip.backlit': 'The light was behind you. Face the light.',
  'complete.tip.dark': 'More light in front of you may help.',
  'complete.tip.motion': 'Keeping your head still may help.',
  'complete.tip.glare': 'Tilt your glasses down slightly.',
  'complete.tip.far.phone': 'Bring the phone a little closer.',
  'complete.tip.far.webcam': 'Sitting a little closer may help.',
  'complete.tip.failed.phone': 'Prop the phone up and add light in front of you.',
  'complete.tip.failed.webcam': 'Sit facing the camera with light in front of you.',

  // The stars and the rule of thumb (design §2.12)
  'complete.stars': '{n} of 3 stars',
  'complete.stars1': '1 of 3 stars',
  'complete.judge': 'Rule of thumb · How we judge this',

  // The zone map (design §2.12)
  'complete.map.label': 'Your {zones}. {hits} of {total} test bubbles hit.',
  'complete.map.labelNone': 'No zones unlocked. {hits} of {total} test bubbles hit.',
  'complete.map.zones': '{n} zones: {names}',
  'complete.map.zone1': '1 zone',
  'complete.map.grid': '{cols} columns and {rows} rows',
  'complete.map.and': '{list} and {last}',
  'complete.map.hit': 'Hit',
  'complete.map.missed': 'Missed',
  'complete.zone.left': 'left',
  'complete.zone.right': 'right',
  'complete.zone.middle': 'middle',
  'complete.zone.top': 'top',
  'complete.zone.bottom': 'bottom',

  // Actions (design §2.12, §7)
  'complete.action.try': 'Try your zones',
  'complete.action.again': 'Warm up again',
  'complete.action.anyway': 'Play anyway',
  'complete.action.getReady': 'Get ready again',
  'complete.action.back': 'Back to the challenge',
};
