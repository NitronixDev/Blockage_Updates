# Validation — 0.4.0

Checked on 2026-10-13 with Node.js 26.11.1, Electron 44.7.0, Three.js 0.186.1 and Blender 4.5.9 LTS.

- **69 unit tests passed**, including the 47 existing engine/file/physics tests.
- **30 Electron workflow checks passed** in the actual sandboxed desktop editor; the reports are `WORKFLOWS_04.json` and `CHARACTER_WORKFLOWS_04.json`.
- Syntax checks passed for all 44 source, desktop, test and script modules.
- All eight built-in model loaders instantiated meshes; OBJ texture loading was verified. Native bulk folder import, scene save/reopen and generated/source rigs were tested.
- Real Blender conversion preserved a 17-bone character and at least four clips. An animated cube also converted. A binary FBX exported by Blender preserved its source skeleton and clips.
- Bone numeric edits, bone gizmo events, pose keys, interpolation, undo, generated humanoid clips and prefab serialization were checked.
- WASD motion, Shift running, Space jump, first/third-person visibility, pause/step and Stop restoration were checked. Fixed-step numerical tests cover acceleration, braking, turning, box/sphere/ceiling contacts and platform landing.
- GitHub service tests use a controlled API response and actual ZIP bytes: digest/fallback manifest, redirected URL rejection, hash failures, CRC/path/symlink checks, separate installation and preservation of the current files. The update UI escapes release HTML. No real repository or published release was supplied.
- Water, terrain, engine and cloth/fluid/emitter example scenes loaded and played without renderer/page errors. Historical 0.3 reports are retained in `docs/history/0.3`.
- The orange cube SVG and icon PNG are byte-for-byte unchanged from 0.3, which restored them from 0.1.

## Practical limits

Graphics checks used Linux SwiftShader/WebGL 2. Windows launch, physical GPU/WebGPU/Vulkan behavior, audible output and restart into a Windows update require a Windows machine and were not executed here. Blender is not bundled. Automatic weights are approximate; production weight painting, IK, retargeting and mesh-based character physics are not included. The GitHub workflow is provided and syntax-reviewed; it has not run in a user's repository.
