# Provenance: BlazeGaze weights (WebEyeTrack, commit 75fbd2f)

| File | Bytes | SHA-256 |
|---|---|---|
| `model.json` | 44,988 | `a214f074ccd4724cf4ebf008814a05485e7eaa5faf5aaeb85e66b24a1af55688` |
| `group1-shard1of1.bin` | 624,072 | `c030a762a2d21ac0f3c59700a723b2d8790f2003b3f8e72fbe31129fcb234e58` |

| Item | Value |
|---|---|
| Source | <https://raw.githubusercontent.com/RedForestAI/WebEyeTrack/75fbd2f5f784f2eb3a39675a8dcbf1b01c697f1c/js/examples/demo-app/public/web/> |
| Upstream commit | `75fbd2f5f784f2eb3a39675a8dcbf1b01c697f1c` (31 August 2026) |
| Retrieved | 1 November 2026 |
| Format | TensorFlow.js LayersModel (Keras 2.11.0, converter 3.21.0); sub-models `cnn_encoder` and `gaze_mlp` |
| Licence | MIT, code and weights, © 2025 Eduardo Davalos, Yike Zhang, Amanda Goodwin, Gautam Biswas (`LICENSE` in this folder) |
| Citation | Davalos, E., Zhang, Y., Goodwin, A. and Biswas, G. (2025). WebEyeTrack: scalable eye-tracking for the browser via on-device few-shot personalization. arXiv:2508.19544 |
| Used by | the `blazegaze` engine (spec §3.1, §4.6.2) |

**Caveat.** The weights were trained on research eye-tracking datasets, whose own terms may
restrict use [inference]; eek-a-calibrate is offered for non-commercial research use. The app
loads these files from this folder only and never contacts the upstream demo's hosting.
