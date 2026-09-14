# Heurist client configuration

## Build targets

One `vite.config.js` defines five targets selected through Vite mode:

| Target | Development port | Output |
| --- | ---: | --- |
| explorer | 5173 | `dist/heurist-explorer/` |
| map | 5174 | `dist/heurist-map/` |
| data | 5175 | `dist/heurist-data/` |
| timeline | 5176 | `dist/heurist-timeline/` |
| graph | 5177 | `dist/heurist-graph/` |

Each invocation sets its app directory as Vite's root and its own `public/`
directory as `publicDir`. Consequently only the selected app's localization and
static assets enter that build.

## Bootstrap contract

Applications read normalized startup data through the shared bootstrap and host
helpers. The supported envelope is:

```js
window.heuristModuleBootstrap = {
  runtime: {},
  settings: {},
  state: {},
  host: { type: 'heurist', bridge: {} }
};
```

The exact allowed values remain application-owned:

- `apps/explorer/src/explorerConfig.js`
- `apps/data/src/dataConfig.js`
- `apps/graph/src/graphConfig.js`
- `apps/map/src/mapConfig.js`
- `apps/timeline/src/timelineConfig.js`

Persisted settings are normalized by each application's configuration schema.
Bootstrap/runtime state and persisted settings are not interchangeable.

## Styles

Each `main.js` imports shared tokens/primitives followed by its local `style.css`.
Widget CSS is imported only by the application that owns the widget. Build asset
names remain stable as `heurist-<target>-main.css`.

## Localization

Each target loads dictionaries relative to its own module URL:

```text
assets/localization/localization_eng.txt
assets/localization/localization_fre.txt
```

The source dictionaries live beneath the relevant `apps/<target>/public/`
directory. Missing keys fall back to their English key text.

## User manuals

Canonical manuals live together in `user-manual/`. The Vite configuration copies
only the manuals relevant to the selected build. Explorer additionally receives
the two search-query-language manuals.

## Module versions

Module versions are declared per target in `vite.config.js` and exposed at build
time as `HEURIST_MODULE_VERSION`. Map retains version `0.6.0`; the other current
targets retain `0.1.0`.

