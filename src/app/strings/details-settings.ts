// Details → Settings (design §2.17, §2.11; spec §17.4.6, §17.5.5, §17.6.5, §17.8.1).

export const strings: Readonly<Record<string, string>> = {
  'details.settings.noDownload': 'no',
  'details.settings.warmup.title': 'Warm-up length',
  'details.settings.warmup.quick': 'Quick',
  'details.settings.warmup.standard': 'Standard',
  'details.settings.warmup.thorough': 'Thorough',
  'details.settings.warmup.quick.detail': 'About 35 s: Pop the dots, then the Test round.',
  'details.settings.warmup.standard.detail': 'About 100 s: four levels. Recommended.',
  'details.settings.warmup.thorough.detail': 'About 3 minutes: five levels, with Lean in.',
  'details.settings.warmup.note': 'Applies from the next warm-up.',

  'details.settings.engines.title': 'Engines',
  'details.settings.engines.auto': 'Auto (recommended)',
  'details.settings.engines.choose': 'Choose',
  'details.settings.engines.autoNote': 'A short device check runs every engine that is fast enough here.',
  'details.settings.engines.chooseNote': 'Exactly the ticked engines run, however slow.',
  'details.settings.engines.always': 'Always runs: it gives the shared face checks.',
  'details.settings.engines.size': '{size} download',
  'details.settings.engines.next': 'A change needs a new warm-up.',

  'details.settings.glasses.title': 'Glasses',
  'details.settings.glasses.none': 'None',
  'details.settings.glasses.glasses': 'Glasses',
  'details.settings.glasses.contacts': 'Contact lenses',
  'details.settings.glasses.undisclosed': 'Prefer not to say',
  'details.settings.glasses.note': 'Kept with your results. Reflections on glasses can lower accuracy.',

  'details.settings.play.title': 'Sound and movement',
  'details.settings.sound': 'Sound',
  'details.settings.sound.detail': 'Soft tones in the levels and the challenge.',
  'details.settings.speech': 'Read instructions aloud',
  'details.settings.speech.detail': 'Uses a voice on this device; no text leaves it.',
  'details.settings.speech.unavailable': 'Unavailable: this device has no voice that reads without sending the text away.',
  'details.settings.limited': 'Limited head movement',
  'details.settings.limited.detail': 'Halves the head turns asked for in Turn your head.',

  'details.settings.look.title': 'Look and extras',
  'details.settings.theme': 'Theme',
  'details.settings.theme.dark': 'Dark',
  'details.settings.theme.light': 'Light',
  'details.settings.theme.note': 'The grey game screens stay grey.',
  'details.settings.expert': 'Expert mode',
  'details.settings.expert.detail': 'Free look adds the raw and per-engine dots, a trail, recording and markers.',

  'details.settings.camera.title': 'Camera',
  'details.settings.camera.note': 'Used from the next time the camera starts.',
};
