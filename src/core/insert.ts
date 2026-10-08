/**
 * 插入文本构造（纯逻辑，不依赖 Obsidian 宿主）
 *
 * 不可变约定：一次 `replaceSelection()` 写入，保证一次 Ctrl+Z 整体撤销。
 */

import { CURSOR } from './constants';
import type { InsertMode } from '../types';

export interface InsertOptions {
	/** 行间公式是否紧凑（单行 `$$x$$`）；false 为独立成行 `$$\nx\n$$` */
	compactDisplay?: boolean;
}

/** 拆出 `CURSOR` 占位符：返回去掉占位符的文本与期望光标位置 */
export function splitCursor(text: string): { body: string; caret: number } {
	const index = text.indexOf(CURSOR);
	if (index < 0) return { body: text, caret: text.length };
	const body = text.split(CURSOR).join('');
	return { body, caret: index };
}

/** 构造带定界符、可直接写入 Markdown 正文的文本 */
export function buildInsertText(
	latex: string,
	mode: InsertMode,
	options: InsertOptions = {},
): string {
	const body = latex.trim();
	if (mode === 'inline') return `$${body}$`;
	return options.compactDisplay ? `$$${body}$$` : `$$\n${body}\n$$`;
}
