# Contributing

Use Windows x64 and Node.js 24.

1. Run `npm.cmd ci` and `npm.cmd run prepare:runtime`.
2. Run `npm.cmd start` to preview the Chinese installation center.
3. Run `npm.cmd run lint`, `npm.cmd test`, `npm.cmd run test:runtime`, and `npm.cmd run test:gui`.
4. Run `npm.cmd run dist`, then `npm.cmd run test:runtime -- dist/win-unpacked/resources/runtime`.

The primary artifact is DSH-Installer, a self-extracting GUI offering web-only, desktop and API setup. It must not install either product before the user clicks its install button. The optional NSIS target is a traditional desktop installer.

Development data, test profiles, screenshots and build caches remain inside the repository. Installation tests use tiny fixture payloads; GUI tests mock install and external-link operations; RPC tests write only fake credentials into isolated homes. Do not run the real installer against a contributor's user directories without their request.

The installer must never overwrite an unrelated directory or modify the system PATH. Keep API keys out of logs, process arguments and renderer persistence. Use the official credential API instead of hand-editing its file format.

Update the Harness CLI pin and runtime lockfile together. Update the pinned Node version in scripts/prepare-runtime.cjs deliberately. Test the new dependency graph against a fresh profile.

Never commit generated dependencies, installers, caches, credentials or sessions. Release tags must match package.json; tag builds create draft releases.
