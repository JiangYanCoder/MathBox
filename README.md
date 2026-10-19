# MathBox

**v3.4.0** — A visual LaTeX formula editor for Obsidian: live preview on top, LaTeX source below, an
option bar in between, and a collapsible side pane holding symbols, templates and favorites.

一个显式的**上下分栏**公式编辑器：上方实时渲染、下方编辑 LaTeX 源码，中间选项栏控制字号 / 字体 /
颜色并提供行内、行间两种插入方式；右侧可展开侧边栏承载常用符号、公式模板与收藏夹。

侧边栏三页（快捷工具 / 公式模板 / 收藏夹）中的公式与符号**均由宿主 MathJax 渲染**，字体与笔记
正文里的公式完全一致（Computer Modern / TeX）。

图像导出（SVG / PNG）走 **MathJax 原生 SVG 输出**：字形是内嵌的矢量路径，不依赖任何字体文件，
导出的图在任何查看器里都与预览逐像素一致，且可无限缩放。

## Features / 功能

| | |
| --- | --- |
| Three entry points | ribbon icon, editor right-click menu (**Insert formula with MathBox**), command `MathBox: Open MathBox formula editor` (default `Ctrl/Cmd+M`) |
| Live preview | rendered through the host MathJax (`renderMath`), 200 ms debounce, errors reported without blanking the last good render |
| Option bar | font size / font family / color / environment on the left; **Insert inline** · **Insert display** on the right |
| Source pane | monospace editor with copy / clear; pasting strips `$`, `$$`, `\(\)`, `\[\]` delimiters automatically |
| Symbol palette | **13 groups / 370 items**, every button rendered as a real formula (Computer Modern / TeX); lazy-rendered with a per-formula cache so the pane opens instantly |
| Formula templates | **9 groups / 66 items**, each entry previewed as a rendered formula instead of raw LaTeX |
| Favorites | search / pin / rename / regroup / delete; stored in the plugin's `data.json`, JSON import & export |
| Hover hints | two-line tooltip: line 1 the LaTeX source, line 2 a Chinese / English description (all 370 symbols covered) |
| Matrix entries | buttons preview a 2×2 case (`a₁₁ … a₂₂`) and **insert a 2×2 skeleton** with `&` / `\\` already in place; arbitrary sizes via the *custom matrix* dialog |
| Export | LaTeX, MathML, **SVG (native vector — glyphs as paths, no font dependency)**, PNG at 3×; white or transparent background, switchable right in the export menu |
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

Side-pane symbol order: **Common → Greek → Relations → Arrows → Sets & Logic → Fractions →
Radicals → Limits → Trigonometry → Integrals → Large operators → Brackets → Arrays & matrices.**

## Settings / 设置

- **Interface language** — follow app language / 简体中文 / English
- **Expand non-standard macros on insert** — rewrites physics-style commands (`\vb{}`, `\abs{}`,
  `\dv{}{}`, …) as standard LaTeX so the formula stays portable outside Obsidian
- **Use compact display math** — `$$x$$` on one line vs. a fenced block on its own lines
- **Export image background** — white (best for pasting into documents) or transparent (blends into
  any page). The same switch also sits at the top of the export menu, so you needn't leave the panel.
  With a transparent background the glyphs take the current theme's foreground colour.
- **Favorites** — export / import JSON, clear all

## Rendering notes (verified on this machine)

Obsidian bundles only `lib/mathjax/tex-chtml-full.js` — TeX input with ~30 extensions (`ams`,
`mathtools`, `physics`, `mhchem`, …) plus the **CHTML output**. There is **no SVG output component**
and no separate MML output bundle in the host. Consequences:

- **Side pane** — every symbol / template / favorite preview calls the host `renderMath`, i.e. the
  exact same code path that renders formulas in your notes. Font family, size, line height and
  baseline are therefore identical by construction, not by imitation. Multi-line environments
  (`cases`, `align`, `matrix`, `array`, …) switch to display mode automatically, matching `$$…$$`.
- **LaTeX** — copied verbatim.
- **MathML** — taken from the `mjx-assistive-mml > math` subtree that CHTML output already produces,
  with fallbacks to `MathJax.tex2mml` and the internal MathML tree. No font dependency.

### Image export (SVG / PNG)

The host has no SVG output, so the plugin bundles `mathjax-full`'s SVG renderer itself
(`src/exporter/texSvg.ts`). It runs on a `liteAdaptor` — a pure-JS virtual DOM — so it never touches
the real document and cannot interfere with the host's CHTML instance.

Why not snapshot the rendered CHTML instead (the v3.3 approach)? A `foreignObject` snapshot is loaded
as *SVG-as-image*, an isolated document that **may not load external resources**. CHTML glyphs come
from `@font-face` files served over `app://`, so fonts had to be re-inlined as `data:font/woff2;base64`
— a formula ballooned to ~288 KB, and any CSS inheritance drift still shifted the baseline. That route
was cosmetically close but never exactly right.

The SVG renderer emits each glyph as a `<path>` outline with explicit `transform` positions:

| | CHTML snapshot | native SVG output |
| --- | --- | --- |
| Glyphs | text + `@font-face` | embedded `<path>` outlines |
| External deps | fonts (must be inlined) | **none** |
| Single formula | ~288 KB | ~7 KB |
| Zoom | limited by the snapshot | vector, lossless |

Export details:

- **Dimensions** — taken from the SVG `viewBox` (1000 units = 1em) at the preview's font size, so the
  canvas hugs the formula exactly (no oversized white margins).
- **Colour** — `currentColor` is resolved to a concrete value: black on white backgrounds, the theme
  foreground on transparent ones.
- **Portability** — non-standard macros are expanded (`\vb`, `\abs`, `\dv`, …) and `\require{}` is
  stripped before typesetting, so the exported file is self-contained.
- **Fallback** — if the SVG pipeline ever fails to initialise, export falls back to the old CHTML
  snapshot and says so in the toast.

## Development / 开发

```bash
npm install
npm run dev        # esbuild watch
npm run build      # prerender → tsc --noEmit → esbuild production → size gate
npm run lint
npm run selftest   # pure logic + data contracts (no browser)
npm run e2e        # headless Chrome, 362 checks
npm run package    # build → release/{main.js,manifest.json,styles.css,data.json}
```

`main.js` carries a **2000 KB** size gate (`scripts/check-size.mjs`), currently at **≈1824 KB**.
Most of that is the bundled SVG font data (`output/svg/fonts/tex/normal.js` alone is 606 KB of
glyph outlines) — the price of font-independent vector export.

> Budget history: 150 KB → **300 KB** (2026-10-15, symbol palette compiled-in) → **2000 KB**
> (2026-10-19, native SVG export). The **side pane** is still *not* inlined: it is typeset at runtime
> by the host MathJax and cached, which is why the UI code stays small. `npm run prerender` still runs
> as part of `build` (its output feeds `selftest [8]`), but has no runtime consumer since v3.3.

### Layout

```
src/
  main.ts               plugin lifecycle, settings persistence, panel singleton
  settings.ts           defaults, normalization/migration, settings tab
  types.ts              shared types (SymbolItem carries displayLatex / remark / span)
  core/
    formula.ts          pure: block-environment detection, CURSOR → \square
    …                   debounce, wrap, macros, latex, insert
  i18n/                 zh / en tables (never imports "obsidian")
  symbols/              symbol palette (13 groups, 370 items; remarks attached inline)
  templates/            formula templates (9 groups, 66 items)
  favorites/            favorites CRUD (pure), persisted by the settings layer
  exporter/
    texSvg.ts           LaTeX → standalone SVG via mathjax-full's SVG renderer (main path)
    svg.ts              CHTML DOM snapshot + PNG rasterisation (fallback path)
    fontFace.ts → core/ @font-face parsing / data:URI inlining (fallback only)
    index.ts            format dispatch, clipboard & download helpers
  panel/
    formulaView.ts      formula preview: placeholder → lazy render → cache
    floatingTooltip.ts  two-line hover tooltip (singleton)
    …                   Modal workspace: render pane, option bar, source pane, side pane
  commands/             ribbon, editor-menu and command registration
```

### Testing

- `npm run selftest` — validates group ordering, template/symbol de-duplication, `displayLatex`
  contracts, matrix skeleton separators, remark coverage (all 370), span bounds, build-chain order,
  and the SVG export pipeline itself (path glyphs, no `@font-face` / `foreignObject` residue,
  white vs. transparent backgrounds, matrix environments, graceful handling of syntax errors).
- `npm run e2e` — real DOM in headless Chrome: rendered containers, first-screen batch, measured
  button sizes, tooltip content, group order, export menu (background switch), and whether the
  exported SVG loads standalone as an `<img>`.

> Headless note: Edge 155's `--headless=new --dump-dom` no longer writes to stdout (empty output,
> exit code 0). `scripts/e2e/run.mjs` therefore prefers a user-level Chrome install.
>
> MathJax pitfall recorded here: a TeX extension must be **imported** (its configuration module),
> not merely listed in `packages` — registration happens on `require`. `input/tex.js` only pulls in
> `base`, so a name-only list yields "Unknown environment 'pmatrix'".

## Version history

| Version | Highlights |
| --- | --- |
| 3.4.0 | Image export switched to native MathJax SVG output (glyphs as `<path>`, no font dependency, ~7 KB vs ~288 KB); white / transparent background switchable in the export menu; size gate raised to 2000 KB |
| 3.3.0 | Side pane fully rendered through host MathJax (symbols, templates, favorites); two-line hover hints; matrix previews + 2×2 insertion skeletons; group re-ordering; 370 bilingual remarks |
| 3.2.x | Favorites groups, adaptive option bar, panel/tab/popout entry points |
| 3.0.0 | Renamed to MathBox; three-column layout with collapsible side pane; multi-format export |
| 2.0.0 | Right-click invoked three-pane editor (render / source / templates) |
| 1.0.0 | Inline palette on inserting a formula block |

This plugin follows the official Obsidian sample plugin structure (TypeScript + esbuild).
