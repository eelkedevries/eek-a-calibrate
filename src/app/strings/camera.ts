// The camera's messages (platform/camera.ts; spec §4.1).

export const strings: Readonly<Record<string, string>> = {
  'camera.error.insecure': 'The camera needs a secure connection. Open this page over https.',
  'camera.error.unsupported': 'This browser does not support camera access.',
  'camera.error.denied': 'Camera permission denied. Allow camera access for this site in the browser settings, then try again.',
  'camera.error.not-found': 'No camera found. Connect a camera, then try again.',
  'camera.error.device-unavailable': 'The selected camera is no longer available. Choose another camera, then try again.',
  'camera.error.in-use': 'Camera in use by another application. Close that application, then try again.',
  'camera.error.overconstrained': 'The camera offers none of the requested video formats.',
  'camera.error.failed': 'The camera could not be started',
  'camera.unnamed': 'Camera {n}',
  'camera.ended': 'The camera stopped (it was disconnected, or the permission was withdrawn).',
};
