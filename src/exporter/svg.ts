/**
 * CHTML DOM → SVG / PNG 快照（**降级路径**）
 *
 * ## 现状
 * v3.4 起图像导出的主路径是 `exporter/texSvg.ts`——MathJax 直接输出矢量，
 * 字形即 `<path>`，零字体依赖。本文件保留为**兜底**：万一 SVG 管线初始化失败
 * （打包异常、字体数据缺失等），仍能导出一张可用的图。
 *
 * ## 做法
 * 把已渲染的 `mjx-container` 子树序列化进 `<foreignObject>`，并内联 MathJax 的 CHTML 样式表。
 *
 * ## 为什么必须把字体转成 data:URI
 * CHTML 的字形完全来自 `@font-face`（`MJX-TEX-*` woff2，由宿主以 `app://` 资源提供）。
 * 快照交给 `<img>` 加载时（SVG-as-image）是一个独立文档，**禁止加载一切外部资源**：
 * 字体取不到，CHTML 的布局度量与实际字形脱节 → 字符错位、上下标错乱、间距全错。
 * 故导出前把 `src` 换成 `data:font/woff2;base64,…`（内联资源不受限制），并做会话级缓存。
 *
 * ## 已知局限（正是改用 SVG 直出的原因）
 * 本质仍是 HTML 快照：字形依赖内联字体、布局依赖 CSS 继承，
 * 与笔记内的观感只能逼近、无法保证逐像素一致，缩放也受快照限制。
 */

import {
	applyFontFaces,
	extractFontFaces,
	fontFamilyOf,
	hasFontFaces,
	replaceSrcWithDataUri,
} from '../core/fontFace';
import type { ExportBackground } from '../types';

export interface SvgSnapshot {
	svg: string;
	width: number;
	height: number;
	/** 成功内联的字体数量 */
	fontsInlined: number;
	/** 未能内联的字体数量（>0 时字形可能回退系统字体） */
	fontsMissing: number;
}

export interface InlinedCss {
	css: string;
	inlined: number;
	missing: number;
}

export interface SnapshotOptions {
	/** 画布底色：白色（插入文档友好）或透明 */
	background?: ExportBackground;
}

/** 字体 URL → data:URI 缓存：同一次会话内多次导出零重复网络 / 转码开销 */
const fontDataCache = new Map<string, string>();

/**
 * 抓取 MathJax 注入的 CHTML 样式表。
 *
 * **只按 id 判定**（MathJax 注入的表 id 形如 `MJX-CHTML-…`）。
 * 不要用「内容含 mjx-container」这类宽泛条件 —— 插件自己的 `styles.css`
 * 也含 `.mathbox-formula > mjx-container` 选择器，一旦被收进来，
 * 244 条面板规则 + `:root` 变量会一起写进 SVG：
 * 既让文件膨胀数十倍，又会覆盖 CHTML 的度量（上下标错乱）。
 *
 * 兜底：宿主若没用 MJX 前缀 id，则接受「含 @font-face 且不含 .mathbox-」的样式表。
 */
function collectMathJaxCss(): string {
	const primary: string[] = [];
	const fallback: string[] = [];
	document.querySelectorAll('style').forEach((styleEl) => {
		const text = styleEl.textContent ?? '';
		if (!text) return;
		if ((styleEl.id ?? '').startsWith('MJX')) {
			primary.push(text);
			return;
		}
		if (/@font-face[^{]*\{/i.test(text) && !text.includes('.mathbox-')) fallback.push(text);
	});
	const joined = primary.join('\n');
	return joined.length > 0 ? joined : fallback.join('\n');
}

/** 让样式内容可以安全嵌入 XML */
function sanitizeCss(css: string): string {
	return css.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function measure(el: HTMLElement): { width: number; height: number } {
	const rect = el.getBoundingClientRect();
	let width = Math.ceil(rect.width);
	let height = Math.ceil(rect.height);
	if (width <= 0 || height <= 0) {
		width = el.offsetWidth || Math.ceil(el.scrollWidth);
		height = el.offsetHeight || Math.ceil(el.scrollHeight);
	}
	return { width, height };
}

function mimeOf(url: string): string {
	if (/\.woff2(\?|#|$)/i.test(url)) return 'font/woff2';
	if (/\.woff(\?|#|$)/i.test(url)) return 'font/woff';
	if (/\.ttf(\?|#|$)/i.test(url)) return 'font/ttf';
	return 'application/octet-stream';
}

/** ArrayBuffer → base64（分块拼接，避免 fromCharCode 参数个数超限） */
function toBase64(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer);
	const CHUNK = 0x8000;
	let binary = '';
	for (let i = 0; i < bytes.length; i += CHUNK) {
		binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
	}
	return btoa(binary);
}

/** 取字体并转 data:URI；失败返回 null（不抛错，让导出继续走降级） */
async function fetchAsDataUri(url: string): Promise<string | null> {
	if (url.startsWith('data:')) return url;
	const cached = fontDataCache.get(url);
	if (cached) return cached;
	try {
		const response = await fetch(url);
		if (!response.ok) return null;
		const dataUri = `data:${mimeOf(url)};base64,${toBase64(await response.arrayBuffer())}`;
		fontDataCache.set(url, dataUri);
		return dataUri;
	} catch {
		// app:// 在部分环境不可 fetch —— 静默降级，由调用方按 missing 计数提示
		return null;
	}
}

/**
 * 收集**本公式实际用到**的 MJX 字体家族。
 *
 * `document.fonts` 里 status=loaded 的家族是「整个面板渲染过的」，通常 8 个；
 * 而一条公式往往只用到 3–5 个。克隆体脱离文档时 `getComputedStyle` 不完整，
 * 故临时离屏挂载一次再读（读完立即移除）。
 *
 * 精确过滤后，`MJX-TEX-N`（主字体，常占 160 KB 以上）之外的大多数字体
 * 不再被无谓内联。
 */
function collectUsedFamilies(root: HTMLElement): Set<string> {
	const out = new Set<string>();
	const probe = root.cloneNode(true) as HTMLElement;
	probe.setCssProps({
		position: 'fixed',
		left: '-10000px',
		top: '0',
		opacity: '0',
		pointerEvents: 'none',
		width: 'max-content',
	});
	document.body.appendChild(probe);
	try {
		const nodes: HTMLElement[] = [probe];
		probe.querySelectorAll<HTMLElement>('*').forEach((el) => nodes.push(el));
		for (const el of nodes) {
			const family = getComputedStyle(el).fontFamily ?? '';
			for (const part of family.split(',')) {
				const name = part.trim().replace(/^["']|["']$/g, '');
				if (name.startsWith('MJX')) out.add(name);
			}
		}
	} finally {
		probe.remove();
	}
	return out;
}

/**
 * 本页**实际加载过**的 MJX 字体家族（精确收集失败时的回退）。
 *
 * 宿主样式表一次性声明全部 24 个 `MJX-TEX-*` 字体，但一个公式通常只用到 4–8 个。
 * `document.fonts` 中 status 为 `loaded` 的家族正是「渲染时按需下载过」的，
 * 据此过滤可把导出体积从数百 KB 压到数十 KB。
 *
 * 只认 `MJX` 前缀：系统字体（含 CJK）即便 loaded 也与我们无关，
 * 否则会把过滤集合污染成非空、导致真正需要的字体被跳过。
 */
function loadedFontFamilies(): Set<string> {
	const out = new Set<string>();
	const fonts = (document as unknown as { fonts?: FontFaceSet }).fonts;
	if (!fonts || typeof fonts.forEach !== 'function') return out;
	fonts.forEach((face) => {
		const family = (face.family ?? '').replace(/^["']|["']$/g, '').trim();
		if (family.startsWith('MJX') && face.status === 'loaded') out.add(family);
	});
	return out;
}

/**
 * 把样式表里所有 `@font-face` 的 src 换成 data:URI。
 *
 * `only` 给定时只处理这些家族（其余保持原样，避免下载用不到的字体）；
 * 为空集合视为「没有可用信息」→ 全量内联（宁可文件大，不可字形错）。
 */
export async function inlineFontFaces(
	css: string,
	only?: ReadonlySet<string>,
): Promise<InlinedCss> {
	if (!hasFontFaces(css)) return { css, inlined: 0, missing: 0 };

	const restrict = only !== undefined && only.size > 0 ? only : null;
	const faces = extractFontFaces(css).filter((face) => {
		if (!restrict) return true;
		const family = fontFamilyOf(face.body);
		return family !== null && restrict.has(family);
	});
	if (faces.length === 0) return { css, inlined: 0, missing: 0 };

	const resolved = await Promise.all(
		faces.map(async (face) => ({
			face,
			dataUri: face.url ? await fetchAsDataUri(face.url) : null,
		})),
	);

	const rewritten = new Map<string, string>();
	let inlined = 0;
	let missing = 0;
	for (const { face, dataUri } of resolved) {
		if (!dataUri) {
			missing += 1;
			continue;
		}
		rewritten.set(face.block, `@font-face {${replaceSrcWithDataUri(face.body, dataUri)}}`);
		inlined += 1;
	}
	return { css: applyFontFaces(css, rewritten), inlined, missing };
}

/** 生成快照 SVG 字符串（含字体内联；失败不阻断，由 fontsMissing 反映） */
export async function buildSnapshotSvg(
	container: HTMLElement,
	padding = 14,
	options: SnapshotOptions = {},
): Promise<SvgSnapshot | null> {
	// 量取**公式本身**的尺寸。
	// display 模式下 `mjx-container` 是块级、宽度会撑满预览区（实测 773px），
	// 用它当画布会得到「整行宽 + 左右大片白底」；`mjx-math` 才是公式实际占据的区域。
	const formulaEl = container.querySelector<HTMLElement>('mjx-math') ?? container;
	const { width, height } = measure(formulaEl);
	if (width <= 0 || height <= 0) return null;

	const clone = container.cloneNode(true) as HTMLElement;
	clone.setCssProps({
		margin: '0',
		padding: '0',
		background: 'transparent',
		display: 'inline-block',
		// 容器宽度同样收到公式宽度，避免克隆体内的块级元素继续撑满原宽度
		width: `${width}px`,
		height: `${height}px`,
	});

	// 先收集「本公式实际用到的字体家族」，再序列化（收集时会临时离屏挂载克隆体）
	const usedFamilies = collectUsedFamilies(clone);
	const serialized = new XMLSerializer().serializeToString(clone);

	const mjxCss = collectMathJaxCss();
	const only = usedFamilies.size > 0 ? usedFamilies : loadedFontFamilies();
	let inlined = await inlineFontFaces(mjxCss, only);
	// 兜底：家族名若与 @font-face 声明不吻合，一个字都匹配不到 —— 宁可文件大，不可字形错
	if (inlined.inlined === 0 && only.size > 0) {
		inlined = await inlineFontFaces(mjxCss);
	}

	const safeCss = sanitizeCss(inlined.css);
	// 字号取容器的实际计算值：面板字号可调，硬编码 16px 会与实际测量尺寸不符
	const fontSize = getComputedStyle(container).fontSize || '16px';

	// 背景：白色便于插入文档；透明则融入任意底色
	const background = options.background ?? 'white';
	const isWhite = background === 'white';
	const textColor = isWhite
		? '#000000'
		: getComputedStyle(document.body).color || '#000000';

	const totalWidth = width + padding * 2;
	const totalHeight = height + padding * 2;

	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" ` +
		`viewBox="0 0 ${totalWidth} ${totalHeight}">` +
		`<style>${safeCss}</style>` +
		(isWhite
			? `<rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" fill="#ffffff"/>`
			: '') +
		`<foreignObject x="${padding}" y="${padding}" width="${width}" height="${height}">` +
		`<div xmlns="http://www.w3.org/1999/xhtml" ` +
		`style="font-size:${fontSize};line-height:normal;color:${textColor};">${serialized}</div>` +
		`</foreignObject></svg>`;

	return {
		svg,
		width: totalWidth,
		height: totalHeight,
		fontsInlined: inlined.inlined,
		fontsMissing: inlined.missing,
	};
}

/** 可栅格化的最小信息（快照与 SVG 直出结果都满足） */
export interface RasterSource {
	svg: string;
	width: number;
	height: number;
}

/**
 * 把 SVG 栅格化为 PNG Blob。
 *
 * `background` 为 `transparent` 时不铺白底——画布本身是透明的，
 * 生成的 PNG 带 alpha 通道，叠在任何底色上都不突兀。
 */
export async function renderSvgToPng(
	source: RasterSource,
	scale: number,
	background: ExportBackground = 'white',
): Promise<Blob | null> {
	const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source.svg)}`;
	const img = new Image();

	const loaded = new Promise<boolean>((resolve) => {
		img.onload = () => resolve(true);
		img.onerror = () => resolve(false);
		img.src = url;
	});

	if (!(await loaded)) return null;

	const canvas = createEl('canvas');
	canvas.width = Math.max(1, Math.round(source.width * scale));
	canvas.height = Math.max(1, Math.round(source.height * scale));

	const ctx = canvas.getContext('2d');
	if (!ctx) return null;

	if (background === 'white') {
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, canvas.width, canvas.height);
	}
	ctx.setTransform(scale, 0, 0, scale, 0, 0);
	ctx.drawImage(img, 0, 0, source.width, source.height);

	return await new Promise<Blob | null>((resolve) => {
		canvas.toBlob((blob) => resolve(blob), 'image/png');
	});
}
