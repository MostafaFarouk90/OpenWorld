# Decoders

Copied unchanged from `three@0.168.0` `examples/jsm/libs/` so `AssetLoader` can load compressed glTF
without a CDN. Fetched only when a model uses the matching extension.

| Folder | Used for | Upstream | License |
| --- | --- | --- | --- |
| `draco/` (`draco_wasm_wrapper.js`, `draco_decoder.wasm`) | `KHR_draco_mesh_compression` | https://github.com/google/draco | Apache-2.0 |
| `basis/` (`basis_transcoder.js`, `basis_transcoder.wasm`) | KTX2 / Basis Universal textures | https://github.com/BinomialLLC/basis_universal | Apache-2.0 |

When upgrading three, copy the same files from the new version's `examples/jsm/libs/`.
