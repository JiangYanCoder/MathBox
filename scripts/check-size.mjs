/**
 * 构建体积门禁：main.js 必须 ≤ 2000 KB
 *
 * 门禁沿革：
 *  · 150 KB —— 初始（仅面板与插入逻辑）
 *  · 300 KB —— 2026-10-15（符号面板走编译期预渲染，片段 + 字符 CSS 内联）
 *  · 2000 KB —— 2026-10-19（图像导出改用 MathJax 原生 SVG 输出：
 *     内置 mathjax-full 的 SVG 输出组件 + TeX 字体 path 数据。
 *     字形直接是 `<path>`，导出结果零字体依赖、无限缩放。
 *     代价就是这份内置数据：实测 main.js ≈ 1.6 MB。
 *     这是王先生拍板的取舍——导出质量优先于安装体积。）
 *
 * 字体 path 数据（`output/svg/fonts/tex/normal.js` 占 606 KB 源码）无法裁剪：
 * 它承载全部正体字形轮廓，任何子集化都需要额外的 wasm 工具链，得不偿失。
 */

import { statSync } from 'node:fs';

const GATE_KB = 2000;
const FILE = 'main.js';

try {
	const bytes = statSync(FILE).size;
	const kb = bytes / 1024;
	const pretty = kb.toFixed(1);
	if (kb > GATE_KB) {
		console.error(`[size gate] FAIL  ${FILE} = ${pretty} KB (limit ${GATE_KB} KB)`);
		process.exit(1);
	}
	console.log(`[size gate] OK    ${FILE} = ${pretty} KB (limit ${GATE_KB} KB)`);
} catch {
	console.error(`[size gate] FAIL  ${FILE} not found — run the build first`);
	process.exit(1);
}
