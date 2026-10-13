# Architecture — 0.4.0

Electron owns native dialogs, trusted file paths, atomic writes and recovery. A sandboxed, context-isolated preload exposes scene, asset and prefab operations. The renderer has no Node integration, runs on the secure allowlisted blockage:// origin and cannot navigate to external pages.

Scene format version 4 includes timeline settings, entity transform keys, water/terrain configuration, cameras, audio, triggers, expanded body parameters and PBR map slots. Versions 1, 2 and 3 migrate before validation. Asset bytes are embedded, with type/MIME/reference/count checks. Runtime simulation state is not serialized.

| Module | Responsibility |
| --- | --- |
| document.js | Schema, budgets, migration, component conflicts, target checks and history. |
| simulation.js | Fixed-step behavior/key playback, runtime snapshots and restoration. |
| physics.js | Cloth, particle-fluid and emitter solvers. |
| rigid-world.js | Linear body impulses, conservative contacts, ground sampling, buoyancy and spring forces. |
| water.js | CFL-substepped finite differences, rain, height sampling and ripple injection. |
| terrain.js | Seeded fractal noise, mesh generation and triangle-consistent height sampling. |
| animation.js | Key capture/replacement and TRS sampling. |
| audio.js | Audio decoding, positional source graph, playback and context pause. |
| prefab.js | Portable subtree export, reference remapping, deduplicated assets and transactional instantiation. |
| simulation-objects.js | Cloth deformation, marching-cubes surface and instanced particles. |
| procedural-objects.js | Water/terrain meshes and editor-only camera/audio/trigger guides. |
| renderer.js | Graphics, collision transforms, coupling, input, game camera and model clip sampling. |
| editor/app.js | Native commands, properties, timeline, outliner, assets and undoable editing. |

Each simulation tick applies authored key animation or motion behaviors, updates kinematic primitive poses, advances rigid bodies, samples water interactions, then steps deformable solvers. Render geometry is refreshed once per display update. Model clips are sampled at the same simulation time and support deterministic scrubbing and restart after a non-looping clip ends.

Rigid body positions are world-space; authored transforms stay local. Terrain and plane heights are sampled vertically. Cloth and particle-fluid collision primitives are converted to their local coordinates. Water buoyancy samples the deformed heightfield. Primitive displacement wakes and a bounded sample of emitter crossings perturb its wave field. This coupling is approximate and not momentum-conserving.

Game view temporarily copies a scene camera pose into the render camera. Walk/Fly input changes the live camera entity while Play runs. The editor camera pose is retained for saves and restored when Game view ends. Trigger entry state is per run; runtime visibility changes are restored on Stop. Sources use one listener attached to the render camera. Audio decoding occurs on import/load and graph edits update sources while stopped.

Keys store seconds plus local TRS vectors. FPS determines the UI's frame labels and capture spacing; it does not change physics Hz. Shortest Euler differences avoid a 350° → 10° full turn. Transform key playback excludes motion components that write the same transform. Model clip animation is a separate nested animation system.

Prefabs contain one rooted scene subset. Root animation positions are stored relative to its authored placement; instantiation offsets them with the root, remaps internal links and reuses identical embedded assets. Validation completes on temporary arrays before committing an instance to its destination document.

Base/emissive textures use sRGB; normal/roughness/metallic map clones use linear data. Three.js owns shader compilation and Dawn owns the native backend. Automatic, Vulkan-request and WebGL compatibility profiles remain separate; diagnostics reports observed API information.

The UI is intentionally ordinary: compact menus/tools, viewport, outliner, collapsible properties, an asset list, Animation tab and console. The original logo occupies the titlebar and application icon; no promotional panel is added.

Method and API references:

- https://matthias-research.github.io/pages/publications/XPBD.pdf
- https://mmacklin.com/pbf_sig_preprint.pdf
- https://threejs.org/docs/pages/MarchingCubes.html
- https://threejs.org/docs/pages/AnimationMixer.html
- https://threejs.org/docs/pages/PositionalAudio.html


## Version 0.4 model and character paths

`electron/model-import.cjs` inspects models and packages companion buffers/materials/textures before IPC crosses into the renderer. Folder resource resolution stays inside the selected directory, including symlink checks. BLEND uses the trusted `scripts/blender-export.py` subprocess with automatic project scripts disabled. `model-formats.js` owns portable MIME/path rules, and `model-loader.js` resolves bundled resources through the Three LoadingManager.

`rigging.js` keeps source bones, captures their rest/frame transforms, applies offset keys and creates initial chain/humanoid weights for static geometry. `character.js` supplies an original skinned mannequin and locomotion clips. `model-animation.js` advances a per-model AnimationMixer continuously, crossfades character roles, removes horizontal root translation and applies rig offsets. Seeking is separate from incremental playback so clips are not reset each render frame.

`player-controller.js` handles acceleration, yaw, gravity and vertical-volume contacts. The WorldRenderer integrates it at the simulation's fixed 60 Hz step, using primitive world bounds and terrain/plane sampling, then updates clip transitions. Runtime changes stay in objects; authored parameters remain in the version-4 scene document. Source rigs, pose keys and controller settings survive scene/prefab serialization.

`electron/preferences.cjs` stores Blender and public GitHub configuration atomically outside scene files. `updates.cjs` fetches stable GitHub releases, bounds streamed downloads, checks SHA-256 and installs in a fresh directory. `zip-reader.cjs` validates archive metadata and streams extraction with size/CRC checks. The sandboxed preload exposes narrow preference/update commands and progress events. The renderer never gets a filesystem API or GitHub token.
