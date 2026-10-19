/**
 * `@font-face` 解析与改写（纯逻辑，不依赖 Obsidian 宿主与 DOM）
 *
 * 用途：导出 SVG 时把 CHTML 样式表里的 `@font-face` 从「外部 URL」改写成「data:URI」。
 *
 * 为什么必须内联：SVG 作为 `<img>` 加载时（SVG-as-image）是一个**独立文档**，
 * 会禁止加载一切外部资源。CHTML 的字形完全来自 `@font-face`（`MJX-TEX-*` woff2），
 * 字体一旦丢失，CHTML 的布局度量与实际字形脱节 → 字符错位、间距错乱。
 * 而 data:URI 属于内联资源，不受该限制。
 */

export interface FontFaceBlock {
	/** 完整的 `@font-face { … }` 原文，用于回填定位 */
	block: string;
	/** 花括号内的声明体 */
	body: string;
	/** 声明体中第一个 `url(...)` 的地址；没有则为 null */
	url: string | null;
}

/** 取声明体中第一个 `url(...)` 地址（兼容引号包裹与任意空白） */
export function firstFontUrl(body: string): string | null {
	const match = /url\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec(body);
	const url = match?.[1]?.trim();
	return url ? url : null;
}

/** 取声明体里的 `font-family` 值（去引号）；没有则 null */
export function fontFamilyOf(body: string): string | null {
	const match = /font-family\s*:\s*([^;}]+)/i.exec(body);
	const name = match?.[1]?.trim().replace(/^["']|["']$/g, '').trim();
	return name ? name : null;
}

/**
 * 逐个取出样式表中的 `@font-face` 块。
 *
 * 注意 MathJax 生成的写法是「`@font-face` + 编号注释 + `{`」——`{` 前有注释，
 * 故**不能**用 `@font-face\s*\{`（`\s` 不匹配注释），必须用 `[^{]*` 吸收注释与空白。
 * 这一点在真实宿主样式表上实测确认过，否则会一个字体都匹配不到。
 * 字体声明体内不含嵌套花括号，故 `[^}]*` 可安全切分。
 */
export function extractFontFaces(css: string): FontFaceBlock[] {
	const out: FontFaceBlock[] = [];
	const re = /@font-face[^{]*\{([^}]*)\}/gi;
	let match: RegExpExecArray | null;
	while ((match = re.exec(css)) !== null) {
		const body = match[1] ?? '';
		out.push({ block: match[0], body, url: firstFontUrl(body) });
	}
	return out;
}

/** 样式表里是否含 `@font-face`（同样要容忍 `{` 前的注释） */
export function hasFontFaces(css: string): boolean {
	return /@font-face[^{]*\{/i.test(css);
}

/** 把声明体里所有 `url(...)` 换成同一个 data:URI（用回调避免 `$` 被当成替换模式） */
export function replaceSrcWithDataUri(body: string, dataUri: string): string {
	return body.replace(/url\(\s*['"]?[^'")]+['"]?\s*\)/gi, () => `url(${dataUri})`);
}

/** 用改写后的块替换原文，返回新 CSS */
export function applyFontFaces(css: string, rewritten: ReadonlyMap<string, string>): string {
	let out = css;
	rewritten.forEach((newBlock, originalBlock) => {
		out = out.replace(originalBlock, () => newBlock);
	});
	return out;
}
