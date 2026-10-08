# MathBox

A visual LaTeX formula editor for Obsidian: live preview on top, LaTeX source below, an option bar in
between, and a collapsible side pane holding symbols, templates and favorites.

一个显式的**上下分栏**公式编辑器：上方实时渲染、下方编辑 LaTeX 源码，中间选项栏控制字号 / 字体 /
颜色并提供行内、行间两种插入方式；右侧可展开侧边栏承载常用符号、公式模板与收藏夹。

## Features / 功能

| | |
| --- | --- |
| Three entry points | ribbon icon, editor right-click menu (**Insert formula with MathBox**), command `MathBox: Open MathBox formula editor` (default `Ctrl/Cmd+M`) |
| Live preview | rendered through the host MathJax (`renderMath`), 200 ms debounce, errors reported without blanking the last good render |
| Option bar | font size / font family / color / environment on the left; **Insert inline** · **Insert display** on the right |
| Source pane | monospace editor with copy / clear; pasting strips `$`, `$$`, `\(\)`, `\[\]` delimiters automatically |
| Side pane | symbol palette (8 groups), formula templates (9 groups), favorites with search / pin / rename / delete |
| Favorites | stored in the plugin's `data.json`, JSON import & export |
| Export | LaTeX, MathML, SVG, PNG (see *Rendering notes* below) |
| i18n | 简体中文 / English, `auto` follows the app language |
| Theme | every color comes from Obsidian CSS variables; icons are Lucide via `setIcon` |

## Usage / 使用

1. Open the panel from any of the three entry points.
2. Type LaTeX below (or click symbols/templates in the side pane).
3. Watch the preview, optionally apply font size / font / color.
4. Click **Inline formula** or **Display formula** — the panel closes and the formula is written into
   the note in a single editor operation, so one `Ctrl+Z` undoes it.

If a selection that looks like LaTeX (starts with `\`, or is wrapped in `$…$`) is present when the
panel is opened from the menu or the hotkey, it is pre-filled into the source pane.

## Settings / 设置

- **Interface language** — follow app language / 简体中文 / English
- **Expand non-standard macros on insert** — rewrites physics-style commands (`\vb{}`, `\abs{}`,
  `\dv{}{}`, …) as standard LaTeX so the formula stays portable outside Obsidian
- **Use compact display math** — `$$x$$` on one line vs. a fenced block on its own lines
- **Favorites** — export / import JSON, clear all

## Rendering notes (verified on this machine)

Obsidian bundles only `lib/mathjax/tex-chtml-full.js` — TeX input with ~30 extensions (`ams`,
`mathtools`, `physics`, `mhchem`, …) plus the **CHTML output**. There is **no SVG output component**
and no separate MML output bundle. Consequences:

- **LaTeX** — copied verbatim.
- **MathML** — taken from the `mjx-assistive-mml > math` subtree that CHTML output already produces,
  with fallbacks to `MathJax.tex2mml` and the internal MathML tree. No font dependency.
- **SVG / PNG** — a *degraded snapshot*: the rendered CHTML DOM is serialised into a `foreignObject`
  SVG with the MathJax stylesheet inlined, and PNG is rasterised from it at 3×. Glyphs fall back to
  system fonts because `@font-face` resources cannot be loaded inside SVG-as-image. The panel reports
  this in the toast.

## Development / 开发

```bash
npm install
npm run dev      # esbuild watch
npm run build    # tsc --noEmit + esbuild production + size gate
npm run lint
```

`main.js` carries a **150 KB** size gate (`scripts/check-size.mjs`), matching the design doc's P0
budget. Current production build: **≈60 KB**. No network requests, no telemetry.

### Layout

```
src/
  main.ts              plugin lifecycle, settings persistence, panel singleton
  settings.ts          defaults, normalization/migration, settings tab
  types.ts             shared types
  core/                pure logic (never imports "obsidian"): debounce, wrap, macros, latex, insert
  i18n/                zh / en tables (never imports "obsidian")
  symbols/             inlined symbol palette
  templates/           inlined formula templates
  favorites/           favorites CRUD (pure), persisted by the settings layer
  exporter/            LaTeX / MathML / SVG / PNG + clipboard & download helpers
  panel/               Modal workspace: render pane, option bar, source pane, side pane
  commands/            ribbon, editor-menu and command registration
```

This plugin follows the official Obsidian sample plugin structure (TypeScript + esbuild).
