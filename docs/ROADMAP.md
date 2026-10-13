# Development areas after 0.4

These items are planned areas, not implemented features or delivery promises.

| Area | Next substantial work |
| --- | --- |
| Gameplay | Project structure, safe scripts/components, input actions, events, scene transitions and save games. |
| Physics | A production rigid-body backend with angular inertia, capsule/mesh collision, continuous contacts and full joints. |
| Water | Shoreline/obstacle masks, absorption, depth/refraction, planar reflections, foam and stronger physical coupling. |
| Characters | Weight painting, IK, retargeting, editable animation graphs, full root-motion integration, capsule/mesh physics and navigation meshes. |
| Rendering | Shader/material graph, LOD, instancing tools, texture compression, ambient occlusion, better lighting and tested GPU/Vulkan profiles. |
| Simulation | GPU compute paths, cloth self-collision, attachment, baking/caching and improved fluid conservation. |
| Scene tools | Multiple selection, snapping to surfaces, terrain brushes, CSG and larger asset/project workflows. |
| Audio | Streaming, mixers/buses, reverb zones and occlusion. |
| Runtime delivery | Project-to-player builds, Windows installers, game export, resource bundling and CI on Windows hardware. |
| Multiplayer | Transport, replication, authority, prediction, reconciliation and load tests. |

Each area should add a complete vertical slice with usable editor controls, saved scene data and runtime verification. Adding menu entries alone does not implement an engine feature.
