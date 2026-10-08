/**
 * CHTML DOM → SVG / PNG 快照（宿主未打包 SVG 输出组件时的降级路径）
 *
 * 做法：把已渲染的 `mjx-container` 子树序列化进 `<foreignObject>`，
 * 并内联 MathJax 的 CHTML 样式表。局限：`@font-face` 指向 app:// 资源，
 * 在 SVG-as-image 场景下不会加载，字形会回退系统字体——故标记为 degraded。
 */

export interface SvgSnapshot {
	svg: string;
	width: number;
	height: number;
}

/** 抓取 MathJax 注入的 CHTML 样式表 */
function collectMathJaxCss(): string {
	const parts: string[] = [];
	document.querySelectorAll('style').forEach((styleEl) => {
		const text = styleEl.textContent ?? '';
		const id = styleEl.id ?? '';
		if (id.startsWith('MJX') || text.includes('mjx-container')) parts.push(text);
	});
	return parts.join('\n');
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

/** 生成快照 SVG 字符串 */
export function buildSnapshotSvg(container: HTMLElement, padding = 14): SvgSnapshot | null {
	const { width, height } = measure(container);
	if (width <= 0 || height <= 0) return null;

	const clone = container.cloneNode(true) as HTMLElement;
	clone.setCssProps({
		margin: '0',
		padding: '0',
		background: 'transparent',
		display: 'inline-block',
	});

	const serialized = new XMLSerializer().serializeToString(clone);
	const css = sanitizeCss(collectMathJaxCss());

	const totalWidth = width + padding * 2;
	const totalHeight = height + padding * 2;

	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${totalHeight}" ` +
		`viewBox="0 0 ${totalWidth} ${totalHeight}">` +
		`<style>${css}</style>` +
		`<rect x="0" y="0" width="${totalWidth}" height="${totalHeight}" fill="#ffffff"/>` +
		`<foreignObject x="${padding}" y="${padding}" width="${width}" height="${height}">` +
		`<div xmlns="http://www.w3.org/1999/xhtml" ` +
		`style="font-size:16px;line-height:normal;color:#000000;">${serialized}</div>` +
		`</foreignObject></svg>`;

	return { svg, width: totalWidth, height: totalHeight };
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
