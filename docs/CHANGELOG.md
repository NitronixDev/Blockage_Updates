# 0.4.0 — 2026-10-13

Multiple and folder model import; companion resource bundling; Blender-to-GLB conversion; source skeleton and skin preservation; initial chain/humanoid skin generation; bone gizmos, offsets and interpolated pose keys; original playable mannequin; smooth clip transitions and character input; configurable GitHub release updates with SHA-256, bounded ZIP extraction and separate installations; Windows packaging and release workflow. Scene format is version 4 with migration from versions 1–3. Original logo retained.

# 0.3.0

- Restored the exact original cube logo and application icon from 0.1.0.
- Added water heightfields with propagating damped ripples, viewport click interaction, rain, base waves, object wakes and sampled emitter splashes.
- Added seeded terrain, island falloff and collision sampling against the rendered grid.
- Expanded Rigid Body with linear primitive contacts, mass, friction, damping and initial velocities; added Buoyancy and Spring Joint.
- Added transform keys, interpolation, timeline scrubbing, capture/removal, undo and duration/FPS/loop controls.
- Added GLB clip selection, playback speed and loop controls synchronized with simulation time.
- Added scene cameras, Game view, Walk/Fly/Static controllers, keyboard movement and jumping.
- Added WAV/MP3/OGG imports and positional audio with volume, pitch, attenuation, looping and pause/stop.
- Added camera-entry triggers for sound and visibility changes.
- Added portable prefab export/import with internal reference remapping, asset deduplication and transactional validation.
- Added normal, roughness, metallic and emission texture slots with appropriate color spaces.
- Added Path Motion, Follow Target and Look At behaviors.
- Added scene format 3 and migration from formats 1 and 2; preserved native file operations, recovery and existing simulations.
- Added example scenes, a prefab, an animated GLB and an original WAV tone.
- Kept the gray compact interface and existing portable Node.js/npm/Electron runtime.

# 0.2.0

- Replaced the editor layout with a gray, compact viewport, right-hand outliner/properties and an assets list.
- Removed the scene banner, slogans, promotional panels, gradient thumbnails, large accent buttons and startup demo branding.
- Added collapsible property sections and simulation frame controls.
- Added CPU cloth constraints, pinning, wind, damping and primitive collision projection.
- Added particle fluid density projection, viscosity, box bounds, primitive collision and surface/particle display.
- Added a particle emitter with lifetime, spread, gravity and floor bounce.
- Added Velocity, Oscillation, Scale Pulse and Spring; Rotation now supports X/Y/Z.
- Added scene format version 2 with migration from version 1.
- Added individual and combined simulation example scenes.
- Rebuilt render scene/pass state on document replacement.
- Isolated marching-cubes meshing from its render Mesh to prevent its vertex counter being interpreted as an instance count.
- Preserved packaged Node.js, npm, Electron, native file dialogs, portable assets, history and recovery.
