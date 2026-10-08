/**
 * 面板各区域与主控之间的契约
 */

import type { App } from 'obsidian';
import type { Translator } from '../../i18n';
import type { GroupCascade } from '../../favorites/store';
import type { FavoriteItem, FormulaStyle, InsertMode, Lang } from '../../types';
import type MathBoxPlugin from '../../main';

export interface PanelContext {
	app: App;
	plugin: MathBoxPlugin;
	lang: Lang;
	t: Translator;

	/** 读取当前源码 */
	getSource(): string;
	/** 读取源码编辑区的当前选区（无选区时 start === end） */
	getSelection(): { start: number; end: number };
	/** 源码编辑区直接输入（不重置光标） */
	handleEditorInput(value: string): void;
	/** 程序化改写源码；caret 为期望光标位置 */
	setSource(value: string, caret?: number): void;
	/** 在源码区光标处插入文本（支持 CURSOR 占位符） */
	insertIntoSource(text: string): void;
	/** 用整段文本替换源码区内容（模板点选行为，支持 CURSOR 占位符） */
	replaceSourceWith(text: string): void;

	/** 当前源码的排版样式快照 */
	getStyle(): FormulaStyle;
	/** 把源码包进 `\begin{env}...\end{env}` */
	applyEnvironment(env: string): void;

	/** 请求一次（防抖）重渲染 */
	requestRender(): void;
	/** 已渲染公式的容器（导出入参） */
	getRenderedElement(): HTMLElement | null;

	/** 收藏 / 导出 */
	addCurrentToFavorites(): void;
	openExportMenu(anchor: HTMLElement): void;

	/** 把公式写入笔记正文并关闭面板 */
	insertToNote(mode: InsertMode): void;

	/** 收藏夹变更后刷新侧边栏列表 */
	refreshFavorites(): void;
	/** 收藏夹数据访问 */
	getFavorites(): readonly FavoriteItem[];
	/** 以纯函数方式变更收藏夹（增删改），内部负责落盘与刷新 */
	mutateFavorites(mutator: (list: readonly FavoriteItem[]) => FavoriteItem[]): void;
	/**
	 * 删除收藏夹分组：变更分组表与相关条目并**立即落盘**；
	 * 落盘失败时自动回滚并返回 false（界面据此提示错误、保持原状）。
	 */
	deleteFavoriteGroups(targets: string[], cascade: GroupCascade): Promise<boolean>;

	/** 提示消息 */
	notify(message: string, isError?: boolean): void;
}
