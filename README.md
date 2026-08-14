# DSH Desktop

> Unofficial Windows desktop launcher for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness).

DSH Desktop turns the local DeepSeek Harness Web UI into a regular Windows application. It starts Harness automatically, loads it in a dedicated native window, and keeps it one click away in the system tray.

> This project is an independent community project. It is not affiliated with, endorsed by, or maintained by DeepSeek AI.

## Features

- Launches your local `dsh web` service automatically
- Opens Harness in its own desktop window instead of a browser tab
- Runs only through `127.0.0.1`; it does not expose the local service to your network
- Keeps your existing Harness configuration, credentials, workspaces, and sessions in `~/.dsh`
- Minimizes to the notification area; reopen it with one click
- Avoids giving the web UI Node.js access

## Install

### Prerequisite

Install [Node.js](https://nodejs.org/) and DeepSeek Harness first:

```powershell
npm.cmd install --global @deepseek-ai/dsh
```

If PowerShell blocks `npm.ps1`, use `npm.cmd` as shown above.

### Run the packaged app

Download either the installer or the portable `.exe` from the GitHub Releases page, then start **DSH Desktop**. On its first launch, configure your model in the original Harness Settings UI.

### Run from source

```powershell
npm.cmd install
npm.cmd start
```

## Configuration

By default the application starts `dsh --profile web --port 3080` and reuses an already running service on that port.

| Environment variable / argument | Purpose |
| --- | --- |
| `DSH_COMMAND` | Absolute path or command name for an alternative `dsh` executable. |
| `DSH_DESKTOP_PORT` | Port to use when no `--port=` argument is supplied. |
| `--port=3081` | Start or connect to Harness on a specific loopback port. |

Examples:

```powershell
$env:DSH_COMMAND = 'C:\\path\\to\\dsh.cmd'
npm.cmd start -- --port=3081
```

## Build a Windows release

```powershell
npm.cmd install
npm.cmd run lint
npm.cmd run dist
```

The installer and portable executable are written to `dist/`.

## Security model

DSH Desktop is a desktop wrapper, not a remote-hosting solution. The Harness backend remains a local process and is loaded only from `http://127.0.0.1:<port>`. The embedded page has Node integration disabled, uses an isolated preload bridge, and external links open in your normal browser.

Never publish your `~/.dsh` directory: it can contain model credentials and session data.

## License

MIT. DeepSeek Harness itself is released under its own license; see its [upstream repository](https://github.com/deepseek-ai/deepseek-harness).

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the local workflow and safety rules.
