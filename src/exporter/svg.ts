/**
 * CHTML DOM → SVG / PNG 快照（宿主未打包 SVG 输出组件时的降级路径）
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
 * ## 与「真 SVG 输出」的差距
 * 理想路线是 MathJax 的 SVG 输出（字形直接是 `<path>` 矢量、零字体依赖，
 * latexlive.com 的导出即此方案）。但宿主只打包了 CHTML 输出，自带 SVG 输出组件
 * 会突破 300 KB 体积门禁，故此处仍是「快照 + 字体内联」的改良版：
 * 字形与笔记内一致，本质仍是 DOM 快照，缩放极限不如真矢量。
 */

import {
	applyFontFaces,
	extractFontFaces,
	fontFamilyOf,
	hasFontFaces,
	replaceSrcWithDataUri,
} from '../core/fontFace';

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
 * 本页**实际加载过**的 MJX 字体家族。
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

	const serialized = new XMLSerializer().serializeToString(clone);
	const { css, inlined, missing } = await inlineFontFaces(collectMathJaxCss(), loadedFontFamilies());
	const safeCss = sanitizeCss(css);
	// 字号取容器的实际计算值：面板字号可调，硬编码 16px 会与实际测量尺寸不符
	const fontSize = getComputedStyle(container).fontSize || '16px';

	const totalWidth = width + padding * 2;
	const totalHeight = height + padding * 2;

	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" ` +
		`viewBox="0 0 ${totalWidth} ${totalHeight}">` +
		`<style>${safeCss}</style>` +
		`<rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" fill="#ffffff"/>` +
		`<foreignObject x="${padding}" y="${padding}" width="${width}" height="${height}">` +
		`<div xmlns="http://www.w3.org/1999/xhtml" ` +
		`style="font-size:${fontSize};line-height:normal;color:#000000;">${serialized}</div>` +
		`</foreignObject></svg>`;

	return {
		svg,
		width: totalWidth,
		height: totalHeight,
		fontsInlined: inlined,
		fontsMissing: missing,
	};
}

/** 把快照 SVG 栅格化为 PNG Blob */
export async function renderSvgToPng(snapshot: SvgSnapshot, scale: number): Promise<Blob | null> {
	const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(snapshot.svg)}`;
	const img = new Image();

	const loaded = new Promise<boolean>((resolve) => {
		img.onload = () => resolve(true);
		img.onerror = () => resolve(false);
		img.src = url;
	});

	if (!(await loaded)) return null;

	const canvas = createEl('canvas');
	canvas.width = Math.max(1, Math.round(snapshot.width * scale));
	canvas.height = Math.max(1, Math.round(snapshot.height * scale));

	const ctx = canvas.getContext('2d');
	if (!ctx) return null;

	ctx.fillStyle = '#ffffff';
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.setTransform(scale, 0, 0, scale, 0, 0);
	ctx.drawImage(img, 0, 0, snapshot.width, snapshot.height);

	return await new Promise<Blob | null>((resolve) => {
		canvas.toBlob((blob) => resolve(blob), 'image/png');
	});
}
