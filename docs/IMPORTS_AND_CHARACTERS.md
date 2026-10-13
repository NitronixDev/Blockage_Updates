# Imports and characters — 0.4

## Model formats

| Format | Import route | Preserved data |
| --- | --- | --- |
| GLB / GLTF | Built-in glTF 2.0 loader | Meshes, PBR materials, textures, skins, morph targets and clips |
| OBJ + MTL | Built-in loader; companion files are bundled | Meshes, UVs, material colors and texture maps; OBJ does not contain a skeleton or clips |
| FBX | Built-in loader; ASCII 7.x and binary files | Meshes, supported materials, textures, skins and clips; embedded textures stay embedded |
| STL | Built-in ASCII / binary loader | Mesh geometry; a default material is supplied |
| PLY | Built-in ASCII / binary loader | Mesh geometry and vertex colors when present |
| DAE | Built-in Collada loader | Meshes, supported materials, skins and clips |
| 3MF | Built-in archive loader | Meshes and the materials supported by the loader |
| BLEND | Installed Blender → embedded GLB | Meshes, exportable materials/textures, skins, morphs and clips supported by Blender's glTF exporter |

Choose several files in **File → Import Assets**, or a directory in **File → Import Model Folder**. The folder importer searches eight levels, ignores symbolic links, and accepts up to 100 models in 4,000 directory entries. Double-click an imported model in Assets to instantiate it.

GLTF buffer/image files and OBJ/FBX/DAE texture files must be local. A folder import can read resources elsewhere inside that selected directory. For an individual file, resources must be beside or below the model. Referenced files outside that scope and HTTP resource URLs are rejected. Resources are embedded in `.blockage` scenes and prefabs, so the original import folder is not needed after saving.

One model bundle supports 128 companion files and 50 MiB; a scene holds at most 200 assets and 110 MiB of embedded asset data. The renderer rejects models over 1,000,000 vertices, 2,048 meshes, 256 bones or 256 clips. Export GLTF/GLB without Draco, Meshopt or BasisU compression in this release. USD, Alembic, 3DS and other unlisted formats need conversion through Blender or another DCC tool.

## Blender conversion

Install Blender, then choose its executable in **Edit → Preferences**. Blockage also checks PATH and common Blender installation locations. Both ordinary and compressed BLEND files can be passed to Blender. Blender is an external dependency and is not included in the portable Windows ZIP.

The conversion runs with factory startup settings and automatic execution of project Python scripts disabled. A trusted bundled exporter writes a temporary GLB with skins, animations and morphs enabled. The output is inspected before import and the temporary files are removed. A conversion times out after three minutes. Keep any linked textures or Blender libraries available at their original locations while converting.

Blender modifiers, constraints and shaders are exported only as supported by its glTF exporter. This is a conversion workflow, not an interpreter for every Blender feature. `AnimatedCube.blend` and `Character.blend` are original examples created with Blender 4.5.9 LTS.

## Bone editing and animation

Source rigs keep their skin weights and clip tracks. Open **Properties → Rigging**, enable **Show Skeleton**, choose a bone and edit its position offset, rotation offset or scale. **Use Bone Gizmo** attaches the existing Move / Rotate / Scale tools to that bone; **Object Mode** returns to the entity. A gizmo gesture creates one undo step.

Choose a time with the timeline scrubber and press **Insert Pose Key**. Bone offsets are stored relative to the clip pose at that time. Linear, smooth and step interpolation are available; rotations use quaternion interpolation. Scrubbing previews the pose keys, and Play applies them on top of the selected source clip. **Reset Pose** clears the authored offsets; remove stored pose keys separately with **Remove Pose Key**.

For an unskinned model, **Create Rig** generates either a vertical chain with 2–32 bones or a 17-bone humanoid. Two nearby bones receive distance-based weights. A humanoid expects an upright T-pose; it also receives four generated locomotion clips. This initial rigging is limited to 100,000 vertices. Weight painting, IK, retargeting and a full animation graph remain future work; use a DCC tool for carefully authored production weights.

Rig mode, offsets, pose keys, interpolation, player parameters and animation assignments are serialized. Duplicating an entity or importing a prefab remaps entity IDs and disables an extra player controller if one is already active.

## Player control

**Add → Player** creates an original mannequin with 17 bones and Idle, Walk, Run and Jump clips. Any imported Model can enable **Properties → Player → Player Controller**. Select the four clip roles explicitly for imported characters; clip order differs between exporters. Choose `None` for a role without a clip.

Only one player controller can be active. Transform keyframes and transform behaviors must be removed before enabling it. During Play, switch to Game, click the viewport and use WASD / ZQSD, Shift and Space. RMB drag changes the camera direction. The controller supplies acceleration, braking, smooth yaw, gravity, grounded jumping and a configurable vertical collision volume.

Contacts use primitive boxes/cylinders, spheres, planes and terrain height sampling. Rotated boxes use world axis-aligned bounds. Mesh collision, slopes on arbitrary meshes, automatic stair climbing, moving-platform attachment and rigid-body push forces are not implemented here. Adjust capsule radius/height to the world-scale model and use `Model Front` to correct its facing direction.

Third-person camera distance/height and mouse sensitivity are configurable; geometry between the player and camera shortens the follow distance. First-person hides the body and restores it when returning to third-person. Idle/walk/run/jump changes crossfade over the configured Transition Time; walk/run playback speed follows the actual horizontal speed. Horizontal source root translation is removed for controlled characters. Stop restores the editor scene, camera and authored poses.

Primary references: [three.js animation system](https://threejs.org/manual/pages/animation-system.html), [OBJLoader](https://threejs.org/docs/pages/OBJLoader.html), [Blender command line](https://docs.blender.org/manual/en/latest/advanced/command_line/arguments.html) and [Blender glTF exporter](https://docs.blender.org/manual/en/latest/addons/import_export/scene_gltf2.html).
