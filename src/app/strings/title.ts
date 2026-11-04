// The Title (design §2.4, §2.16, §7): the game's front door, the set-up chooser, Play and the
// failures shown in its Play slot.

export const strings: Readonly<Record<string, string>> = {
  'title.name': 'Pop with your eyes',
  'title.pitch': 'Warm up the tracker, then pop bubbles just by looking.',
  'title.play': 'Play',
  'title.skip': 'Skip warm-up',
  'title.hero': 'How the game goes',
  'title.map.label': 'The game',
  'title.map.locked': ' (locked)',
  'title.progress': 'Downloading the face model',
  'title.chooser.label': 'How are you playing?',
  'title.chooser.propped': 'Propped',
  'title.chooser.propped.name': 'Phone propped up',
  'title.chooser.inHand': 'In hand',
  'title.chooser.inHand.name': 'Phone in hand',
  'title.chooser.webcam': 'Webcam',
  'title.chooser.webcam.name': 'Computer webcam',
  'title.meta.quick': 'About 2 minutes',
  'title.meta.standard': 'About 3 minutes',
  'title.meta.thorough': 'About 4 minutes',
  'title.meta.local': 'Nothing is uploaded',
  'title.unsupported': 'This browser cannot run the game. Try Chrome, Edge or Safari 17 or later.',
  'title.blocked.title': 'Camera blocked',
  'title.blocked.body': 'Allow the camera in your browser settings, then try again.',
  'title.failed.title': 'The camera did not start',
  'title.retry': 'Try again',
};
