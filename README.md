# Blockage 0.4.0

Desktop 3D scene editor built with Node.js, Electron and Three.js. The UI is in English and uses compact gray panels. The original orange cube logo is restored.

Extract the full Windows ZIP and run `START_BLOCKAGE.bat`. Node.js 26.11.1, npm 12.2.0, Electron 44.7.0, dependencies, source and examples are included. No dependency download is needed to start. French instructions: `START_HERE_FR.md`.

## New in 0.4

- Import multiple GLB, GLTF, OBJ + MTL, FBX, STL, PLY, DAE and 3MF models, or a folder containing up to 100 models. Companion textures and buffers are embedded in saved scenes.
- Import BLEND through an installed Blender executable. Configure it in **Edit → Preferences**; Blender is not bundled.
- Preserve source skeletons, skin weights, morph targets and animation clips when the format contains them. Generate an initial vertical chain or humanoid rig for a static mesh. Edit bone offsets with fields or the transform gizmo, record pose keys, scrub them, undo, save and export prefabs.
- **Add → Player** creates an original 17-bone mannequin with Idle, Walk, Run and Jump clips. Models also have a Player component with clip-role selectors. Acceleration, braking, turning, gravity, jumping, collision dimensions and transition duration are configurable.
- During Play, switch to **Game** and click the viewport: WASD or ZQSD, Shift to run, Space to jump, RMB drag to look. Choose first- or third-person camera in Player properties.
- **Help → Check for Updates** reads stable releases from a configured public GitHub repository. Downloads are verified with SHA-256 and installed into a separate folder; save the current scene before restarting into the update.
- A Windows packaging command and GitHub release workflow are included. See `docs/GITHUB_UPDATES.md`.

Try **File → New Scene → Character Test**, or open `examples/ImportedCharacter.blockage`. Import examples are in `examples/assets/ImportSamples`; `Character.glb`, `Character.fbx` and `Character.blend` exercise source skinning and clips. The original orange logo remains unchanged.

See `docs/IMPORTS_AND_CHARACTERS.md` for formats, conversion, limits and the rig workflow.

## Features from 0.3

| Feature | Editor controls |
| --- | --- |
| Water surface | Add → Water. Wave speed, damping, resolution, base waves, rain, ripple strength/radius and object interactions. During Play, click the visible water to disturb it or press Ripple. |
| Terrain | Add → Terrain. Seeded fractal heightfield, size, height, resolution, frequency, octaves and island falloff. Terrain Collision toggles rigid-body and player floor sampling. |
| Rigid Body | Behaviors → Rigid Body. Mass, friction, restitution, damping, initial XYZ velocity, primitive contacts, resting stacks and terrain/floor contact. |
| Buoyancy | Behaviors → Buoyancy. Adds Rigid Body if needed, then applies immersion lift and water drag. |
| Spring Joint | Behaviors → Spring Joint. Adds Rigid Body if needed. Select a collider target, rest length, stiffness and damping. |
| Animation | Animation tab, time scrubber and K. Capture position/rotation/scale keys, choose linear/smooth/step interpolation, remove keys and undo. Scene settings controls duration, FPS and loop. |
| Imported animation | Models with embedded GLB clips expose Model Animation: clip, speed and loop. Play, Step and timeline scrubbing use the same simulation clock. |
| Game camera | Add → Camera, then Game. Static, Fly or Walk controller. During Play: WASD, RMB drag to look, Shift to move faster, Space to jump when walking. |
| Audio | Import WAV/MP3/OGG, then double-click the clip to add an Audio Source. Positional attenuation, volume, pitch, loop and Play on Start. |
| Triggers | Add → Trigger. Camera enters a box in Game view: play sound, toggle, show or hide a target. Once or repeat on re-entry. |
| Prefabs | File → Export Selected as Prefab / Import Prefab. Portable hierarchy, components, keys and required embedded assets; each instance gets fresh entity IDs. |
| PBR maps | Texture Maps: normal, roughness, metallic and emission textures, in addition to base color. Data maps use linear color space. |
| Target behaviors | Path Motion, Follow Target and Look At. Targets use scene entity references and are remapped when a subtree is duplicated or imported. |

The previous cloth, particle-fluid, emitter, motion behaviors, PBR lighting, shadows, fog, exposure, bloom, transform gizmos, native file dialogs, undo/redo, hierarchy, recovery and render modes remain available.

## Try it

File → New Scene offers Character Test, Water Test, Terrain Test, Engine Test and Simulation Test. The editor still starts with a cube, ground and a light.

| Example file | Contents |
| --- | --- |
| `examples/WaterTest.blockage` | Ripples, moving collider wakes, falling sphere and floating cube. |
| `examples/TerrainTest.blockage` | Terrain with eight falling bodies and a player camera. |
| `examples/EngineTest.blockage` | Water, terrain, flag, fountain, key animation, following object and spring joint. |
| `examples/AudioTest.blockage` | Camera, reusable entry trigger and an original PCM tone. Switch to Game and walk toward the cube. |
| `examples/SimulationTest.blockage` | Cloth, particle fluid and emitter. |
| `examples/ClothTest.blockage`, `FluidTest.blockage`, `ParticlesTest.blockage` | Individual solver tests. |
| `examples/PhysicsPlayground.blockage` | Falling primitive bodies. |
| `examples/FloatingCube.blockageprefab` | An object with Rigid Body and Buoyancy, ready to import near water. |
| `examples/assets/AnimatedCube.glb` | Uncompressed GLB with the Lift animation. |
| `examples/assets/Tone.wav` | Original short sound for import tests. |

Play advances the simulation at 60 fixed steps per second. Pause freezes simulation and audio; Step advances one physics tick; Stop restores the authored transforms, visibility and solver arrays. The timeline FPS controls keyframe time spacing and labels, independently of the physics step rate. Editing solver parameters and capturing keys require Stop.

To animate: select an object without transform behaviors, insert a key at time zero, move the time scrubber, move the object, then insert another key. Scrubbing previews the saved keys without modifying the authored scene. Set Animation → Enabled off to use transform behaviors on an object that has saved keys. Reset Pose previews time zero; Stop returns to the authored pose.

## Controls

| Input | Action |
| --- | --- |
| LMB drag / MMB drag / wheel | Orbit / pan / zoom in Scene view. |
| RMB + WASD; Q/E; Shift | Scene-view flight, altitude and faster movement. |
| Q / W / E / R | Select / move / rotate / scale. |
| F / G | Frame selected / grid. |
| F5 / Esc | Start or toggle pause / Stop. |
| K | Insert a transform key at the current timeline time. |
| Ctrl S / Ctrl O / Ctrl I | Save / open / import assets. |
| Ctrl Z / Ctrl Shift Z | Undo / redo. |
| Ctrl D / Delete | Duplicate / delete subtree. |
| Ctrl P | Command search. |

Scene files are portable JSON `.blockage` documents with embedded assets. Scene format version 4 reads and migrates versions 1, 2 and 3. Prefabs use `.blockageprefab`. Save and prefab export have independent native file targets. Imported prefab keys can extend the scene duration. Scene camera settings and runtime motion are kept separate: saving during Play stores authored entity poses. Model companion files are bundled at import. GLTF/GLB must be uncompressed; external HTTP resource URLs are rejected.

## Simulation scope and budgets

These implementations provide bounded, interactive prototypes. They are not production physics or scientific CFD solvers.

- Water solves a damped two-dimensional wave equation on a heightfield with CFL-limited substeps. Base waves are added to the ripple field. It has fixed edges, one height per cell, rain, primitive displacement wakes and particle impact ripples. There is no refraction, planar reflection capture, shoreline obstacle solver, breaking wave mesh or volume conservation. Environment lighting supplies the reflections. Water is separate from the 3D particle-fluid solver.
- Rigid bodies use linear impulses with mass, friction and restitution. Spheres use sphere contacts; cubes and cylinders use conservative axis-aligned boxes. There are no angular inertia, rolling, continuous collision detection or triangle-mesh contacts. Terrain contact samples the visible triangle heightfield vertically; it does not compute slope friction or normal-based rolling. Spring joints are damped distance forces, rather than a full joint constraint library.
- Buoyancy approximates immersion against visible water surfaces. Primitive displacement and sampled emitter impacts drive visual ripples; the water field does not receive equal-and-opposite rigid-body impulses. Water and terrain work most predictably with unit scale and no pitch/roll rotation.
- Cloth uses XPBD distance links for stretch, shear and bending, pinning, wind and primitive projection. No self-collision, tearing, garment fitting or mesh attachment is included.
- Particle fluid uses density projection, artificial separation, spatial neighbor search, viscosity and box bounds. Its surface is reconstructed by marching cubes. It has no exact volume conservation, fluid-to-cloth feedback, vorticity model, baking or fluid cache export. Cloth and particle-fluid gravity/collision calculations remain local to their simulation object.
- Emitters have lifetime, capacity, speed spread, gravity, floor bounce and bounded water impact sampling. They do not collide with arbitrary scene meshes.
- The legacy Camera Walk controller and new Player controller use floor/terrain contact and primitive bounds. The Player has smooth locomotion blending and a vertical collision volume; neither controller implements mesh collisions, navigation, IK or automatic climbing. Triggers monitor the controlled player in third-person, or the active game camera otherwise. Spatial audio has distance attenuation but no acoustic occlusion/reverb simulation.
- Animation interpolates TRS vectors, using the shortest Euler angle path between keys; it is not a graph-based animation state machine. Built-in key animation and transform behaviors are mutually exclusive. Model skin/clip evaluation is provided by Three.js, with bone-offset keys and idle/walk/run/jump crossfades layered on top.

Per scene: 4,000 entities; 200 embedded assets; 4,000 fluid/emitter particles; 12,000 cloth vertices; 100,000 water/terrain vertices; 256 dynamic primitive bodies; 10,000 transform keys. Each asset is at most 50 MiB, with a 110 MiB total embedded asset budget and a 160 MiB scene-file limit. Small fluid containers must fit their particle count and radius. A maximum of 256 particles per emitter are sampled for water impacts, with at most eight splashes per water surface per tick. Very low frame rates slow simulation because display delta is capped at 0.1 seconds.

These components do not yet include networking, arbitrary gameplay scripting, navigation meshes, a shader/node editor, mesh sculpting, CSG, a full animation graph/IK system or a packaged game build pipeline. The included player opens and runs `.blockage` scenes. `docs/ROADMAP.md` records the next development areas.

## Graphics and development

The automatic profile uses Three.js WebGPURenderer, with WebGL 2 when WebGPU cannot initialize. Use `START_BLOCKAGE_COMPAT.bat` if a driver produces a black viewport or an error. `START_BLOCKAGE_VULKAN.bat` requests the experimental Chromium Vulkan/ANGLE path; Dawn chooses the actual native backend. A Vulkan request is not proof of native Vulkan rendering on Windows. No Vulkan performance gain is claimed.

Open `DEV_TERMINAL.bat` to use the portable Node.js and npm:

```text
npm start
npm run start:compat
npm run start:vulkan
npm run play
npm test
npm run check
npm run doctor
npm run examples
```

Bundled executables target Windows x64. On Linux/macOS, install Node.js 26.11.1 or newer and run `npm ci` to obtain the matching Electron binary. The source is MIT licensed; dependencies keep their original licenses. Validation details: `docs/VALIDATION.md`.
