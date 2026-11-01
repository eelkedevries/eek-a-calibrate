# Provenance: MediaPipe canonical face model

| Item | Value |
|---|---|
| File | `canonical_face_model.obj` (unchanged) |
| Bytes | 45,999 |
| SHA-256 | `8bac80443397e113f41a8b565ea72c59390bc031d9defab289dba7bc0c54e618` |
| Source | <https://raw.githubusercontent.com/google-ai-edge/mediapipe/master/mediapipe/modules/face_geometry/data/canonical_face_model.obj> |
| Retrieved | 1 November 2026; the hash was checked against the source file on that day |
| Licence | Apache License 2.0 (`LICENSE` in this folder), © Google LLC (the MediaPipe authors) |
| Used by | `tests/sim/faceSim.ts` (the face simulator of specification §10.2) and the canonical-model tests of WP5 |

The model has 468 vertices in centimetres, in MediaPipe's canonical face frame: +x towards the
subject's anatomical left, +y up, +z out of the face (towards a camera the face looks at). It
has no iris vertices; the simulator adds landmarks 468–477 from its own eyeball model.

It is test data only: it is never part of the built site.
