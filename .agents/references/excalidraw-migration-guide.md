> 来源：Excalidraw 官方仓库导出 `migrated-project-design.md` 内嵌的 `MIGRATION_GUIDE.md`（原文件 16.12 KB，修改时间 2026-10-06T12:20:52Z）。
> 抽取时间：2026-10-06。抽取方式：原文逐行照搬，未改写内容，仅去除外层 `` `markdown `` 围栏。
> 关联：`excalidraw-vue-integration.md`（Vue 桥接补充）、`whiteboard-integration.md`（本项目路线 A 设计）。

---

# Excalidraw Migration Guide

> Audience: an AI agent in the **target project** absorbing this codebase as a feature (embedded whiteboard/diagram editor). Goal: integrate without re-reading the whole monorepo. Read sections 0, 2, 5, 6 first; use the file map (section 10) only when editing.

## 0. TL;DR

- This is the **Excalidraw monorepo** (Yarn 1.22.22 classic workspaces), **not** a single app.
- It ships two things:
  1. packages/excalidraw -> the **embeddable React library** @excalidraw/excalidraw v0.18.0. **This is the real porting target.**
  2. excalidraw-app -> standalone site (excalidraw.com) = library + collab + Firebase + PWA + local persistence. **Do NOT port wholesale**; port only what you need.
- Stack: React 19, TypeScript 5.9, Vite 5 (app) / esbuild (packages), Jotai 2.11, Vitest 3. Node >= 18.
- Library is **canvas-rendered** and imperative-ish: a big App owns a mutable element store + actions + rendering; host talks via props + an imperative ExcalidrawImperativeAPI ref.
- Whiteboard only -> vendor the 6 packages/* and render <Excalidraw />. Need collab/share/PWA -> also port parts of excalidraw-app.

## 1. What it is

Open-source hand-drawn whiteboard. Library features: infinite canvas, hand-drawn shapes, arrow binding, text, images, shape libraries, i18n, export PNG/SVG/clipboard, .excalidraw JSON, undo/redo, zoom/pan. App-only: realtime collab, E2E encryption, shareable read-only links, PWA/offline, local-first autosave, Firebase.

## 2. Topology and dependency graph

(root: yarn classic workspaces)

- packages/common               @excalidraw/common             (leaf)
- packages/math                 @excalidraw/math               (leaf)
- packages/fractional-indexing  @excalidraw/fractional-indexing (leaf)
- packages/laser-pointer        @excalidraw/laser-pointer      (leaf)
- packages/utils                @excalidraw/utils              (export helpers)
- packages/element              @excalidraw/element            -> common, math, fractional-indexing
- packages/excalidraw           @excalidraw/excalidraw         -> all of the above + ~30 runtime deps
- excalidraw-app                private app -> @excalidraw/excalidraw + firebase, socket.io, sentry, idb-keyval, uqr, pwa
- examples/                     with-nextjs, with-script-in-browser (integration references)
- dev-docs/                     Docusaurus docs
- firebase-project/             firestore rules/indexes, storage rules
- public/                       static assets
- scripts/                      build/release/locale/woff2 tooling

**Port order = dependency direction:** common/math/fractional-indexing/laser-pointer -> element -> utils + excalidraw -> excalidraw-app.
No circular cross-package deps; element does NOT depend on excalidraw (only type-only imports of App/AppState). Keep that boundary.

## 3. Package-by-package

### packages/common
Shared primitives, no UI. constants.ts (APP_NAME, EVENT, MIME_TYPES, THEME, FONT_FAMILY, ROUNDNESS, DEFAULT_*_OPTIONS, DEFAULT_LASER_COLOR, UserIdleState), utils.ts (debounce, throttleRAF, resolvablePromise, isShallowEqual, bytesToHexString...), colors.ts, keys.ts, points.ts, url.ts (normalizeLink), emitter.ts, editorInterface.ts, font-metadata.ts, utility-types.ts (Merge, ValueOf, MakeBrand, ResolutionType), binary-heap.ts, promise-pool.ts, queue.ts, random.ts, versionedSnapshotStore.ts, appEventBus.ts.

### packages/math
Geometry: points, vectors, curves. Used by element + rendering.

### packages/fractional-indexing
Z-order keys (element index).

### packages/laser-pointer
Laser trail rendering/animation.

### packages/element (most important data layer)
- types.ts - ExcalidrawElement union + brands (OrderedExcalidrawElement, NonDeleted<>, Ordered, FileId, GroupId). Every element: id, version, versionNonce, index, seed, updated, isDeleted.
- store.ts - mutable element store + CaptureUpdateAction (IMMEDIATELY / NEVER / EVENTUALLY) driving undo/redo. Scene.ts is the scene container.
- newElement.ts, mutateElement.ts (mutateElement, newElementWith, bumpVersion), duplicate.ts (deepCopyElement).
- binding.ts, elbowArrow.ts, arrowheads.ts, arrows/ - arrow binding/routing.
- bounds.ts, collision.ts, selection.ts, resizeElements.ts, transform.ts, transformHandles.ts, dragElements.ts, distance.ts.
- renderElement.ts, shape.ts, textElement.ts, textWrapping.ts, textMeasurements.ts, containerCache.ts.
- frame.ts, groups.ts, zindex.ts, sortElements.ts, linearElementEditor.ts, image.ts, embeddable.ts, cropElement.ts, bucketFill.ts, flowchart.ts, stickyNote.ts, convertToShape.ts.
- delta.ts - diff/patch. index.ts re-exports all + hashElementsVersion, getSceneVersion, isNonDeletedElement, getNonDeletedElements.
- Depends only on common, math, fractional-indexing.

### packages/utils
Stateless export pipeline: exportToCanvas, exportToBlob, exportToSvg, exportToClipboard (from @excalidraw/utils/export).

### packages/excalidraw (porting target)
- index.tsx entry: exports <Excalidraw/>, ExcalidrawAPIProvider, hooks, re-exports.
- components/App.tsx core editor (split into App.*.ts partials: text, pan, wheel, clipboard, drawshape...). components/LayerUI.tsx UI chrome around canvas.
- actions/ command pattern: manager.tsx, register.ts, shortcuts.ts, types.ts, one action*.ts(x) per feature (delete, duplicate, zindex, properties, export, frames, history, link, align, distribute, flip, group...).
- data/: restore.ts, json.ts (serializeAsJSON, serializeLibraryAsJSON), blob.ts (loadFromBlob, loadSceneOrLibraryFromBlob), reconcile.ts (reconcileElements), library.ts, encode.ts, encryption.ts, types.ts (ImportedDataState).
- components/main-menu/, footer/, welcome-screen/, Sidebar/, TTDDialog/, CommandPalette/ - composable children.
- i18n.ts + locales/ (Crowdin JSON). fonts/ (CDN default; self-host via window.EXCALIDRAW_ASSET_PATH). css/, polyfill.ts.
- types.ts: AppState, UIAppState, ExcalidrawProps, ExcalidrawImperativeAPI, BinaryFiles, ExcalidrawInitialDataState, Collaborator, SocketId.
- Runtime deps (~30): roughjs, perfect-freehand, jotai, jotai-scope, pako, pica, image-blob-reduce, nanoid, browser-fs-access, radix-ui, tunnel-rat, clsx, fuzzy, points-on-curve, png-chunk-*, @braintree/sanitize-url, CodeMirror set, @excalidraw/mermaid-to-excalidraw, @excalidraw/random-username, es6-promise-pool, canvas-roundrect-polyfill, sass.
- Peer deps: React 17/18/19 + react-dom.

### excalidraw-app (reference, do not port blindly)
- App.tsx composition; index.tsx mounts with PWA registerSW.
- collab/: Collab.tsx (socket.io client, throttled cursor/element sync, follow-user), Portal.tsx, CollabError.tsx.
- data/: index.ts (collab link parse/gen, backend import/export, encryption), LocalData.ts (IDB autosave, library adapters), FileManager.ts (chunked/encrypted upload), firebase.ts, localStorage.ts, tabSync.ts, fileStatusStore.ts, Locker.ts, TTDStorage.ts.
- share/ShareDialog.tsx, QRCode.tsx. app-jotai.ts (separate store), app_constants.ts (WS events, storage keys, Firebase prefixes, timeouts), app-language/, components/ (AppMainMenu, AppFooter, AppWelcomeScreen, AppSidebar, DebugCanvas, AI...), ExcalidrawPlusIframeExport.tsx, sentry.ts.
- Backend config: firebase-project/.

## 4. Core runtime

**State.** Jotai backbone. Editor uses editor-jotai.ts -> editorJotaiStore; app uses app-jotai.ts -> appJotaiStore. Element data is NOT in jotai - it lives in the mutable element store, pushed to React via onChange. AppState is a plain object the editor owns; host reads/partially controls via props + imperative API.

**Element model.** Plain objects with branded types. Mutate only via mutateElement/newElementWith (bumps version + randomized versionNonce). Undo/redo via CaptureUpdateAction on updateScene. Ordering = fractional indices. Remote/local merge = data/reconcile.ts.

**Actions.** Each command is an Action (name, perform, keyTest, optional predicate, PanelComponent). Register in actions/register.ts, manage in actions/manager.tsx, key-bind in actions/shortcuts.ts. Add/remove UI commands here, not in App.tsx.

**Rendering.** Canvas 2D (renderElement.ts), RAF-throttled redraw; LayerUI.tsx overlays DOM UI via tunnel-rat portals. Host-injectable: renderTopLeftUI, renderTopRightUI, renderCustomStats.

**Serialization.** serializeAsJSON -> open .excalidraw format; restore* sanitizes untrusted input; reconcileElements merges for collab.

**i18n / fonts.** i18next + locales/*.json. Fonts default from CDN; self-host by copying dist/prod/fonts and setting window.EXCALIDRAW_ASSET_PATH.

## 5. Library vs app boundary (decide per capability)

| Capability | Lives in | Port? |
|---|---|---|
| Editor canvas + tools + export | packages/excalidraw (+ utils/element/common/math) | Yes - core |
| .excalidraw open format | packages/excalidraw/data | Yes |
| Shape libraries | data/library.ts + components/LibraryMenu* | Usually yes |
| i18n | i18n.ts + locales/ | If non-English needed |
| Realtime collab | excalidraw-app/collab + socket server | Only if needed |
| Shareable E2E links | excalidraw-app/data/index.ts + backend | Only if needed |
| Local autosave (IDB) | excalidraw-app/data/LocalData.ts | Usually yes |
| Image file storage | excalidraw-app/data/FileManager.ts + Firebase | Only if needed |
| PWA / offline | vite-plugin-pwa + registerSW | Rarely |
| Sentry / analytics | sentry.ts, analytics.ts | Replace with target telemetry |

**Rule:** vendor the 6 packages/* as internal modules and mount <Excalidraw />. Treat excalidraw-app as a reference implementation, not a dependency.

## 6. Public integration surface

Rely only on the package root export (packages/excalidraw/index.tsx) + documented deep type paths.

**Component and hooks**
- <Excalidraw /> (memoized; ExcalidrawProps: initialData, onChange, onExcalidrawAPI, UIOptions, theme, viewModeEnabled, zenModeEnabled, gridModeEnabled, activeTool, interaction, ui, langCode, renderTopLeftUI, renderTopRightUI, renderCustomStats, onExport, validateEmbeddable, renderEmbeddable, imageOptions, ...).
- ExcalidrawAPIProvider, useExcalidrawAPI, useExcalidrawStateValue, useOnExcalidrawStateChange, useEditorInterface, useStylesPanelMode.
- Children: MainMenu, Footer, Sidebar, WelcomeScreen, LiveCollaborationTrigger, CommandPalette, DefaultSidebar, TTDDialog, TTDDialogTrigger, DiagramToCodePlugin, Stats, Ellipsify, Button, Fonts.
- ExcalidrawImperativeAPI (via onExcalidrawAPI/ref): scene get/set, updateScene, addFiles, getAppState, getSceneElements, getFiles, setToast, getName, updateLibrary.

**Functions**
- Data: serializeAsJSON, serializeLibraryAsJSON, loadFromBlob, loadSceneOrLibraryFromBlob, restore*, reconcileElements, getDataURL, getSceneVersion, hashElementsVersion, hashString, getNonDeletedElements, getTextFromElements, isInvisiblySmallElement, isLinearElement, isElementLink.
- Export: exportToCanvas, exportToBlob, exportToSvg, exportToClipboard.
- Elements: mutateElement, newElementWith, bumpVersion, CaptureUpdateAction, convertToExcalidrawElements, getCommonBounds, getVisibleSceneBounds, elementsOverlappingBBox.
- Viewport/coords: sceneCoordsToViewportCoords, viewportCoordsToSceneCoords, zoomToFitBounds, getFormFactor, normalizeLink, throttleRAF.
- Consts: FONT_FAMILY, THEME, MIME_TYPES, ROUNDNESS, DEFAULT_LASER_COLOR, UserIdleState.
- Styles: @excalidraw/excalidraw/index.css.

**Deep type paths** (package exports map; type-only, no .js): @excalidraw/excalidraw/element/types, .../element/transform, .../data/types, .../common/utility-types, .../types; plus @excalidraw/element, @excalidraw/common/*, @excalidraw/math/*, @excalidraw/utils/*.

> v0.18 breaking change: old @excalidraw/excalidraw/types/... deep paths are removed; remap if used (see packages/excalidraw/README.md).

## 7. Build and tooling

- Yarn 1.22.22 classic workspaces. Node >= 18.
- Packages: esbuild (scripts/buildBase.js, buildPackage.js), ESM, splitting true, output dist/dev (unminified+sourcemap) + dist/prod (minified); types via tsc -> dist/types. Internal @excalidraw/* are external.
- App: Vite 5 (excalidraw-app/vite.config.mts) with React, SVGR, EJS, PWA, checker, sitemap; manualChunks split locales/mermaid/CodeMirror; fonts under fonts/<family>/. Dev path aliases map @excalidraw/* -> packages/*/src.
- Tests: Vitest 3 (jsdom + canvas mock). Typecheck tsc. Lint ESLint + Prettier.
- Root scripts: build:packages (ordered common -> fractional-indexing -> laser-pointer -> math -> element -> excalidraw), build:app, start, test:typecheck, test:code, test:app, fix, rm:build, clean-install.
- Font subsetting via scripts/woff2/* + wasm. Windows not guaranteed (shell-heavy scripts).

## 8. Migration strategy (phased)

1. Decide scope (section 5).
2. Vendor packages in dependency order: common, math, fractional-indexing, laser-pointer, element, utils, excalidraw. Rewrite @excalidraw/* specifiers to the target alias scheme (mirror the Vite alias block).
3. Reconcile the build (esbuild config or switch packages to the target bundler). Ensure import.meta.env is defined for packages.
4. Verify React peer version (17/18/19) + react-dom.
5. Import styles; provide a non-zero-height container.
6. Mount client-only; SSR -> use client + dynamic(..., { ssr: false }).
7. Re-wire host concerns: persistence, file storage, telemetry, share-link routing. Reuse excalidraw-app/data/* as reference.
8. i18n + fonts: include needed locales; self-host fonts + window.EXCALIDRAW_ASSET_PATH if desired.
9. Feature-gate optional layers (collab, share, PWA, sentry) so unused deps are not pulled.
10. Port Vitest config + jsdom/canvas mock; run typecheck + targeted tests.

## 9. Pitfalls

- Blank canvas = missing CSS import or zero-height parent.
- window is not defined / hydration in SSR -> client-only render.
- Versioned mutation: always mutateElement/newElementWith; never mutate fields directly.
- CaptureUpdateAction: remote/init -> NEVER; async multi-step local -> EVENTUALLY.
- Two jotai stores (editor vs app) - do not merge.
- Keep packages/element independent of packages/excalidraw (type-only imports of App/AppState).
- Repo conventions (AGENTS.md): use app.ownerDocument/app.ownerWindow over globals (else derive from mounted node ownerDocument/defaultView); prefer Merge<Base, Overrides> from @excalidraw/common/utility-types over Omit<...> and ... .
- Deep import paths changed in 0.18 (type-only subpaths, no .js). Runtime imports from root + index.css.
- Mermaid/CodeMirror/locales are lazy chunks - keep external/lazy for bundle size.
- EXCALIDRAW_ASSET_PATH only when self-hosting; else CDN.

## 10. Token-saving reading map

| Need | Read |
|---|---|
| Public API | packages/excalidraw/index.tsx, packages/excalidraw/types.ts |
| Props / imperative API | dev-docs/docs/@excalidraw/excalidraw/api/props/* |
| Element model | packages/element/src/types.ts |
| Mutations / undo | packages/element/src/store.ts, mutateElement.ts, newElement.ts |
| Commands | packages/excalidraw/actions/{manager.tsx,register.ts,shortcuts.ts,types.ts} |
| Serialize / load | packages/excalidraw/data/{json.ts,blob.ts,restore.ts,reconcile.ts,types.ts} |
| Export | packages/utils/src/export* |
| Core editor | packages/excalidraw/components/App.tsx (+ App.*.ts), LayerUI.tsx |
| App composition (ref) | excalidraw-app/App.tsx, index.tsx |
| Collab (ref) | excalidraw-app/collab/Collab.tsx, data/index.ts |
| Local persistence (ref) | excalidraw-app/data/LocalData.ts |
| Build/tooling | root package.json, scripts/buildBase.js, scripts/buildPackage.js, excalidraw-app/vite.config.mts |
| Integration examples | examples/with-nextjs, examples/with-script-in-browser, packages/excalidraw/README.md |
| Docs site | dev-docs/docs/** |
| Conventions | CLAUDE.md, AGENTS.md, CONTRIBUTING.md |

**Do NOT read end-to-end:** components/App.tsx (1300+ lines, split partials), locales/*.json, dist/, public/, firebase-project/ (unless doing backend), CHANGELOG.md.

## 11. Key facts

- Library: @excalidraw/excalidraw 0.18.0, ESM, types at dist/types/excalidraw/index.d.ts.
- Peers: react/react-dom ^17 || ^18 || ^19.
- Styles: @excalidraw/excalidraw/index.css.
- Minimal mount (TSX):

    import { Excalidraw } from "@excalidraw/excalidraw";
    import "@excalidraw/excalidraw/index.css";
    export default function App() {
      return <div style={{ height: "100vh" }}><Excalidraw /></div>;
    }

- Internal packages: @excalidraw/common, element, math, utils, fractional-indexing, laser-pointer (0.18.0 except utils).
- Tooling: Yarn 1.22.22, esbuild (packages), Vite 5 (app), Vitest 3, TS 5.9, Node >= 18.
