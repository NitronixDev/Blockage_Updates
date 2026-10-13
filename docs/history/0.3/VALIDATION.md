# Validation — 0.3.0

Checked on 2026-10-13 with Node.js 26.11.1, Electron 44.7.0 and Three.js 0.186.1.

## Results

- **47 Node unit tests passed.**
- **51 Electron workflow checks passed**: 21 regression checks, 23 expanded-feature checks and 7 focused input/coupling checks.
- Syntax checks passed for all 27 source, desktop, test and script modules.
- All 10 example scenes and the prefab passed version-3 validation.
- The logo SVG and icon PNG are byte-for-byte matches to the 0.1.0 ZIP.
- Windows Node.js and Electron binaries are included as PE files. Portable npm package metadata reports 12.2.0.

The workflow reports are included beside this file as REGRESSION_WORKFLOWS.json, FEATURE_WORKFLOWS.json and FOCUSED_WORKFLOWS.json.

## Coverage

Unit tests cover scene serialization/migration, component conflicts, malformed data, hierarchy and targets, asset references, prefab remapping/deduplication/transactional failure, long animation timelines, history budgets and atomic saves. Numerical tests cover cloth constraints/anchors/contact, particle-fluid containment/separation/viscosity, emitter reset, wave propagation/decay/CFL stability, seeded rain, terrain grid sampling, sphere momentum, body stacks, embedded sphere-box projection, buoyancy equilibrium and spring bounds. Animation checks cover interpolation, shortest angle paths, duplicate key replacement, fixed-step playback and restoration.

Electron checks exercise actual menus, property fields, viewport clicks, simulation controls, native dialogs/IPC, audio decoding, GLB clips, prefab export/import, shader color spaces, save/open/recovery and Game input. A raycast click increased the water height at the hit point; moving primitives and emitter crossings generated ripples. Terrain seed edits changed the mesh, and bodies landed on it. Game view WASD activated an audio zone; F5 pause/resume and Space jump were verified with canvas focus. A non-looping GLB clip successfully scrubbed backward after its end. Disabling primitive contacts retained gravity. Stop restored authored scene data and solver state.

The compact UI and water, terrain, timeline and combined-engine scenes were inspected visually in Electron. Rendering used Linux x64 software WebGL 2 / SwiftShader. This is not a hardware performance benchmark. No renderer JavaScript exceptions were observed in the successful workflow runs.

## Limits of the evidence

Windows executables were not run on Windows in this environment. A physical GPU, native Vulkan rendering, driver compatibility and audible speaker output were not verified. Audio tests establish successful decoding, spatial source graph setup, playback state and context pause/resume. WebGPU/Vulkan had a software presentation issue in the earlier test environment; the Vulkan profile remains experimental and no performance gain is claimed.

The numerical checks establish bounded prototype behavior, not scientific accuracy or production-engine parity. Rigid bodies use linear primitive contacts without angular inertia; water is a heightfield; cloth lacks self-collision; particle fluid uses approximate density projection. Details and budgets are in README.md.

## Run the shipped checks

From DEV_TERMINAL.bat:

```text
npm test
npm run check
npm run doctor
```

For a manual check, load Water Test, click Play and the water, then Pause/Step/Stop. Load Terrain Test and Engine Test. Import AnimatedCube.glb and Tone.wav. Save/reopen a scene and export/import a prefab. Use START_BLOCKAGE_COMPAT.bat if the automatic GPU profile fails on your machine.
