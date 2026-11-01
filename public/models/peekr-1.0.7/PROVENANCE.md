# Provenance: Peekr eye model 1.0.7

| Item | Value |
|---|---|
| File | `peekr.onnx` |
| Bytes | 579,176 |
| SHA-256 | `9abc6c98ee02ee518da98777d1cd879ff9bbaf71491ed2c803a608e9740ce7fb` |
| Source | <https://registry.npmjs.org/peekr/-/peekr-1.0.7.tgz>, file `package/dist/model/peekr.onnx` |
| Retrieved | 1 November 2026 |
| Format | ONNX, opset 11; inputs `input1` and `input2` [1, 3, 128, 128], `kps` [1, 8]; output `output` [1, 2] |
| Licence | MIT © 2025 AryamanTaore (`LICENSE` in this folder, copied from the package) |
| Used by | the `peekr` engine (spec §3.1, §4.6.3) |

**Caveats.** The author reports 1.75° × 2.52° after a 5-point calibration; this is not
peer-reviewed. The provenance of the training data is not stated. The package's own copy of
the model on a third-party blob store is never referenced by this app.
