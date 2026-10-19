/**
 * MathJax 原生 SVG 输出（字形 = `<path>` 矢量，零字体依赖）
 *
 * ## 为什么需要它
 * 旧路线是「CHTML DOM → foreignObject 快照 + 字体 data:URI 内联」。
 * 该路线的死穴在于 **SVG-as-image 是独立文档**：字体必须靠内联才生效，
 * 而 CHTML 的排版是 CSS 驱动的，任何样式差异都会让字形与度量脱节。
 * v3.3 已修过两轮（内联字体、隔离面板样式），真机上仍有偏差，
 * 因此改为「让 MathJax 直接产出矢量」——这是 latexlive.com 等站点导出的同一条路线。
 *
 * ## 与快照路线的本质差别
 * | | foreignObject 快照 | SVG 输出（本模块） |
 * |---|---|---|
 * | 字形 | 文本 + @font-face | `<path d="…">` 内嵌轮廓 |
 * | 布局 | CSS | 显式 `transform="translate(…)"` |
 * | 外部依赖 | 字体（必须内联） | **无** |
 * | 缩放 | 受 HTML 快照限制 | 无限缩放不失真 |
 *
 * ## 为什么不复用宿主的 MathJax
 * 宿主只打包了 CHTML 输出组件与 CHTML 字体（无 `tex2svg`、无 SVG 字体 path 数据），
 * 故此处内置 mathjax-full 的 SVG 输出组件（约 1.5 MB，门禁已放宽）。
 * 使用 `liteAdaptor` 这个纯 JS 虚拟 DOM：**不接触真实 DOM**，也不会与宿主的
 * MathJax 实例产生任何交互（各自独立的模块实例与注册表）。
 *
 * ## 管线懒初始化
 * 首次导出才构造 TeX/SVG 管线（字体数据索引有一次性开销），之后复用同一 document。
 */

import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import type { LiteElement } from 'mathjax-full/js/adaptors/lite/Element.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { TeXFont } from 'mathjax-full/js/output/svg/fonts/tex.js';

/**
 * TeX 扩展包**必须逐个 import 配置文件**——`packages` 选项只按名字去
 * `ConfigurationHandler` 里取，而注册动作发生在配置文件被 `require` 时。
 * `input/tex.js` 只自动引入 `base`，其余包若只写进 `packages` 数组，
 * 会得到「Unknown environment 'pmatrix'」这类诡异报错（实测踩坑）。
 * 顺序有意义：`ams` 必须在 `mathtools` 之前（后者依赖前者的宏表）。
 */
import 'mathjax-full/js/input/tex/ams/AmsConfiguration.js';
import 'mathjax-full/js/input/tex/mathtools/MathtoolsConfiguration.js';
import 'mathjax-full/js/input/tex/newcommand/NewcommandConfiguration.js';
import 'mathjax-full/js/input/tex/noundefined/NoUndefinedConfiguration.js';
import 'mathjax-full/js/input/tex/configmacros/ConfigMacrosConfiguration.js';
import 'mathjax-full/js/input/tex/color/ColorConfiguration.js';
import 'mathjax-full/js/input/tex/cancel/CancelConfiguration.js';
import 'mathjax-full/js/input/tex/cases/CasesConfiguration.js';
import 'mathjax-full/js/input/tex/textmacros/TextMacrosConfiguration.js';
import 'mathjax-full/js/input/tex/bbox/BboxConfiguration.js';
import 'mathjax-full/js/input/tex/boldsymbol/BoldsymbolConfiguration.js';
import 'mathjax-full/js/input/tex/unicode/UnicodeConfiguration.js';

import { expandMacros } from '../core/macros';
import type { ExportBackground } from '../types';

/**
 * 启用的 TeX 扩展包。
 *
 * 不引 `AllPackages`（含 bussproofs / colortbl / empheq / physics 等冷门包，
 * 实测多出约 200 KB），只保留笔记里高频使用的集合；
 * 其余如 `\dv`、`\abs` 这类非标准命令由 `expandMacros` 展成标准 LaTeX 后再排版。
 */
const TEX_PACKAGES = [
	'base',
	'ams',
	'newcommand',
	'noundefined',
	'configmacros',
	'color',
	'cancel',
	'cases',
	'mathtools',
	'textmacros',
	'bbox',
	'boldsymbol',
	'unicode',
];

export interface TexSvgOptions {
	/** 行间公式（display）还是行内公式 */
	display?: boolean;
	/** 四周留白（px） */
	padding?: number;
	/** 公式基准字号（px），决定 viewBox 的物理尺寸 */
	fontSize?: number;
	/** 底色：白色或不铺底 */
	background?: ExportBackground;
	/** 字形颜色（透明背景时通常取主题前景色） */
	color?: string;
}

export interface TexSvgResult {
	svg: string;
	width: number;
	height: number;
}

interface Pipeline {
	adaptor: ReturnType<typeof liteAdaptor>;
	doc: ReturnType<typeof mathjax.document>;
}

let pipeline: Pipeline | null = null;

/** 构造（或复用）TeX → SVG 管线 */
function ensurePipeline(): Pipeline {
	if (pipeline) return pipeline;
	const adaptor = liteAdaptor();
	RegisterHTMLHandler(adaptor);
	const doc = mathjax.document('', {
		InputJax: new TeX({ packages: TEX_PACKAGES }),
		// 'local'：每个公式自带 <defs>，导出即独立可用，不依赖页面里别处的缓存
		OutputJax: new SVG({ fontCache: 'local', font: new TeXFont() }),
	});
	pipeline = { adaptor, doc };
	return pipeline;
}

/** 去掉 `\require{…}`：导出管线未注册这些包，留着会直接报错 */
function stripRequire(latex: string): string {
	return latex.replace(/\\require\s*\{[^{}]*\}/g, '');
}

/** 解析 viewBox 的四个分量 */
function parseViewBox(value: string): [number, number, number, number] | null {
	const parts = value.trim().split(/[\s,]+/).map((n) => Number.parseFloat(n));
	if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
	return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 0];
}

/** 数字保留 2 位小数，避免体积与可读性被浮点噪声拖累 */
function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

/**
 * LaTeX → 独立 SVG 字符串。
 *
 * 返回的 SVG 可**直接**存成 `.svg` 文件或作为 `<img src>` 使用：
 * 内部不含 `@font-face`、不含 `foreignObject`、不引用任何外部资源。
 *
 * 排版失败（TeX 语法错误等）时模板本身会渲染成红色 `merror`，仍返回 SVG；
 * 只有当管线抛异常（例如字体数据缺失）时才返回 `null`，由调用方降级。
 */
export function texToSvg(latex: string, options: TexSvgOptions = {}): TexSvgResult | null {
	const source = stripRequire(expandMacros(latex)).trim();
	if (!source) return null;

	const display = options.display ?? true;
	const padding = options.padding ?? 14;
	const fontSize = options.fontSize && options.fontSize > 0 ? options.fontSize : 16;
	const background = options.background ?? 'white';
	const color = options.color ?? '#000000';

	let html: string;
	try {
		const { adaptor, doc } = ensurePipeline();
		// 不要传 `end` 选项：SVG 输出下它会让 MathJax 内部读到 null 节点而抛错
		// （实测 "Cannot read properties of null (reading 'kind')"）
		// `doc.convert` 的返回类型是 any，显式收窄成 LiteElement 再序列化
		const node = doc.convert(source, { display }) as unknown as LiteElement;
		html = adaptor.outerHTML(node);
	} catch {
		return null;
	}

	// 取出 MathJax 生成的 <svg>（外层还套了一个 <mjx-container>）
	const open = html.indexOf('<svg');
	const close = html.lastIndexOf('</svg>');
	if (open < 0 || close < 0) return null;
	const inner = html.slice(open + 4, close); // 从属性的起始处开始
	const attrEnd = inner.indexOf('>');
	if (attrEnd < 0) return null;
	const attrs = inner.slice(0, attrEnd);
	const bodyRaw = inner.slice(attrEnd + 1);

	const vbMatch = /viewBox="([^"]+)"/.exec(attrs);
	const vb = vbMatch ? parseViewBox(vbMatch[1] ?? '') : null;
	if (!vb) return null;
	const [vbX, vbY, vbW, vbH] = vb;
	if (vbW <= 0 || vbH <= 0) return null;

	// MathJax 的内部单位：1000 units = 1em
	const unitsPerPx = 1000 / fontSize;
	const padUnits = padding * unitsPerPx;

	const viewX = round2(vbX - padUnits);
	const viewY = round2(vbY - padUnits);
	const viewW = round2(vbW + padUnits * 2);
	const viewH = round2(vbH + padUnits * 2);

	const width = round2((viewW / 1000) * fontSize);
	const height = round2((viewH / 1000) * fontSize);

	// currentColor 在独立 SVG 里依赖 `color` 属性的继承；直接替换成具体色值最稳
	const body = bodyRaw.replace(/currentColor/g, color);

	const bgRect =
		background === 'white'
			? `<rect x="${viewX}" y="${viewY}" width="${viewW}" height="${viewH}" fill="#ffffff"/>`
			: '';

	return {
		svg:
			`<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" ` +
			`width="${width}" height="${height}" viewBox="${viewX} ${viewY} ${viewW} ${viewH}" ` +
			`role="img" focusable="false">` +
			bgRect +
			body +
			`</svg>`,
		width,
		height,
	};
}

/** 管线是否已就绪（测试与诊断用） */
export function isSvgPipelineReady(): boolean {
	return pipeline !== null;
}
