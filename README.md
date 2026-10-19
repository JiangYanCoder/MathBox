# MathBox

**v3.4.0** — A visual LaTeX formula editor for Obsidian: live preview on top, LaTeX source below, an
option bar in between, and a collapsible side pane holding symbols, templates and favorites.

一个显式的**上下分栏**公式编辑器：上方实时渲染、下方编辑 LaTeX 源码，中间选项栏控制字号 / 字体 /
颜色并提供行内、行间两种插入方式；右侧可展开侧边栏承载常用符号、公式模板与收藏夹。

侧边栏三页（快捷工具 / 公式模板 / 收藏夹）中的公式与符号**均由宿主 MathJax 渲染**，字体与笔记
正文里的公式完全一致（Computer Modern / TeX）。

图像导出（SVG / PNG）走 **MathJax 原生 SVG 输出**：字形是内嵌的矢量路径，不依赖任何字体文件，
导出的图在任何查看器里都与预览逐像素一致，且可无限缩放。

<img width="1489" height="992" alt="image" src="https://github.com/user-attachments/assets/7bd2fbb5-e14f-4f11-8b75-ae3201c358d7" />


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
