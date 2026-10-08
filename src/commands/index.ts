/**
 * 三入口注册（ribbon / 编辑器右键菜单 / 命令 + 快捷键）
 */

import { Editor, MarkdownFileInfo, MarkdownView, Platform } from 'obsidian';
import { MathBoxModal, resolvePrefill } from '../panel/MathBoxModal';
import { MATHBOX_VIEW_TYPE } from '../panel/MathBoxView';
import type MathBoxPlugin from '../main';

/**
 * 「独立窗口」能力仅桌面端可用。
 *
 * `workspace.openPopoutLeaf()` 与 `workspace.moveLeafToPopout()` 依赖 Electron
 * 的多窗口支持，移动端（Capacitor）没有对应实现——调用会直接抛错。
 * 本插件声明 `isDesktopOnly: false`（浮动面板、符号表、导出等其余功能在移动端
 * 均可正常使用），故相关的两条命令改用 `checkCallback`：移动端返回 false，
 * 命令从命令面板中隐去，而不是列出来一点就报错。
 */
function isPopoutSupported(): boolean {
	return Platform.isDesktopApp;
}

/**
 * 以**工作区标签页**打开面板（吸附在主界面，可拆分 / 停靠侧边）。
 * 此时"最小化"= 收进标签栏，不再是收缩为顶栏。
 */
export async function openMathBoxTab(plugin: MathBoxPlugin): Promise<void> {
	// active: true 已让该标签取得焦点，无需 revealLeaf（其为 1.7.2+ API）
	const leaf = plugin.app.workspace.getLeaf('tab');
	await leaf.setViewState({ type: MATHBOX_VIEW_TYPE, active: true });
}

/**
 * 在**独立的 OS 窗口**打开面板（Electron 弹出窗口，仅桌面端）。
 * 已打开的标签页亦可拖出主窗口，或用 `workspace.moveLeafToPopout(leaf)` 程序化弹出。
 */
export async function openMathBoxPopout(plugin: MathBoxPlugin): Promise<void> {
	const leaf = plugin.app.workspace.openPopoutLeaf();
	await leaf.setViewState({ type: MATHBOX_VIEW_TYPE, active: true });
}

/** 把已存在的 MathBox 标签页弹出为独立窗口（吸附 → 独立；仅桌面端） */
export function popOutMathBoxLeaf(plugin: MathBoxPlugin): boolean {
	const leaf = plugin.app.workspace.getLeavesOfType(MATHBOX_VIEW_TYPE)[0];
	if (!leaf) return false;
	plugin.app.workspace.moveLeafToPopout(leaf);
	return true;
}

export function registerCommands(plugin: MathBoxPlugin): void {
	// 入口 1：左侧侧边栏图标
	plugin.addRibbonIcon('sigma', 'MathBox', () => {
		plugin.openPanel({ source: 'ribbon' });
	});

	// 入口 2：编辑器右键菜单
	plugin.registerEvent(
		plugin.app.workspace.on(
			'editor-menu',
			(menu, editor: Editor, _info: MarkdownView | MarkdownFileInfo) => {
				menu.addItem((item) => {
					item
						.setTitle(plugin.t('command.insertWithMathBox'))
						.setIcon('sigma')
						.onClick(() => {
							plugin.openPanel({
								source: 'menu',
								editor,
								prefill: resolvePrefill(editor.getSelection()),
							});
						});
				});
			},
		),
	);

	// 入口 3：命令面板 + 快捷键
	// 依设计文档 §2 提供默认 Ctrl/Cmd+M；在「设置 → 快捷键」中可改绑或清除
	plugin.addCommand({
		id: 'open',
		name: plugin.t('command.openPanel'),
		hotkeys: [{ modifiers: ['Mod'], key: 'M' }],
		editorCallback: (editor: Editor) => {
			plugin.openPanel({
				source: 'command',
				editor,
				prefill: resolvePrefill(editor.getSelection()),
			});
		},
	});

	// 入口 4：以标签页打开（吸附在主界面）
	plugin.addCommand({
		id: 'open-as-tab',
		name: plugin.t('command.openAsTab'),
		callback: () => {
			void openMathBoxTab(plugin);
		},
	});

	// 入口 5：在独立窗口中打开（桌面专属，移动端隐藏，见 isPopoutSupported）
	plugin.addCommand({
		id: 'open-in-popout',
		name: plugin.t('command.openInPopout'),
		checkCallback: (checking: boolean) => {
			if (!isPopoutSupported()) return false;
			if (!checking) void openMathBoxPopout(plugin);
			return true;
		},
	});

	// 入口 6：把已打开的 MathBox 标签页弹出为独立窗口（桌面专属，移动端隐藏）
	plugin.addCommand({
		id: 'popout-leaf',
		name: plugin.t('command.popoutLeaf'),
		checkCallback: (checking: boolean) => {
			if (!isPopoutSupported()) return false;
			if (!checking && !popOutMathBoxLeaf(plugin)) {
				// 当前没有 MathBox 标签页可弹出 —— 退化为新开一个独立窗口
				void openMathBoxPopout(plugin);
			}
			return true;
		},
	});
}

/** 供外部（如测试）直接打开面板 */
export function openPanelFromView(plugin: MathBoxPlugin): void {
	const view = plugin.app.workspace.getActiveViewOfType(MarkdownView);
	plugin.openPanel({ source: 'command', editor: view?.editor ?? null });
}

export { MathBoxModal };
