# Verified dependency versions

Checked on **2026-10-12**. Stable releases are used; prerelease/nightly Electron builds are excluded.

| Component | Pinned version | Source |
| --- | --- | --- |
| Development Node.js | 26.11.1 Current | https://nodejs.org/en/download |
| npm | 12.2.0 | https://registry.npmjs.org/npm/latest |
| Electron | 44.7.0 stable | https://releases.electronjs.org/ |
| Electron embedded Node.js | 24.21.0 | https://releases.electronjs.org/ |
| Electron Chromium | 152.0.7977.130 | https://releases.electronjs.org/ |
| Three.js | 0.186.1 | https://registry.npmjs.org/three/latest |

Official Node and Electron Windows/Linux archive SHA-256 checksums were verified before packaging. npm dependency archives are pinned with integrity fields in `package-lock.json`. The included npm distribution is 12.2.0; it is copied into the portable Node distribution without replacing the Node executable.

Graphics references:

- https://threejs.org/docs/pages/WebGPURenderer.html
- https://threejs.org/manual/pages/webgpu-postprocessing.html
- https://dawn.googlesource.com/dawn/+/HEAD/docs/dawn/overview.md
- https://chromium.googlesource.com/chromium/src/+/HEAD/gpu/config/gpu_switches.cc

The release folder contains original dependency licenses, including Electron/Chromium notices, Node's license and npm's license.
