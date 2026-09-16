# Heurist Explorer client applications

This repository contains six independently built Heurist browser applications:

- `heurist-explorer`
- `heurist-data`
- `heurist-graph`
- `heurist-map`
- `heurist-timeline`
- `heurist-recordview`

They share the neutral code under `shared/`, but no application imports another
application. Explorer loads presentation applications in iframes and communicates
with them only through the public host-bridge contract.

## Install

```bash
npm install
```

One installation provides the dependencies for every application.

## Development

```bash
npm run dev:explorer
npm run dev:data
npm run dev:graph
npm run dev:map
npm run dev:timeline
npm run dev:recordview
```

The target application becomes the Vite root. Its `index.html`, source tree and
public localization assets remain isolated from all other targets.

## Builds

```bash
npm run build:explorer
npm run build:data
npm run build:graph
npm run build:map
npm run build:timeline
npm run build:recordview
npm run build:all
```

Outputs are written to `dist/heurist-<target>/`. Every build is a separate Vite
invocation, so a module distribution never depends on chunks belonging to another
module.

## Tests

```bash
npm test
npm run test:explorer
npm run test:data
npm run test:graph
npm run test:map
npm run test:timeline
npm run test:recordview
npm run test:shared
```

See `docs/architecture.md`, `docs/configuration.md`, and `docs/integration.md`.

