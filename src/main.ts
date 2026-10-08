/**
 * MathBox 插件入口
 *
 * 职责边界（遵循 AGENTS.md）：本文件只做插件生命周期与跨模块编排，
 * 具体功能分散在 core / i18n / symbols / templates / favorites / exporter / panel / commands。
 */

import { Editor, MarkdownView, Notice, Plugin, moment } from 'obsidian';
import { registerCommands } from './commands';
import { MATHBOX_VIEW_TYPE, MathBoxView } from './panel/MathBoxView';
import { SAVE_DEBOUNCE_MS } from './core/constants';
import { createDebounce, type Debounced } from './core/debounce';
import {
	applyExtensionInjection,
	installMathJaxConfigGuard,
	scheduleDeferredInjection,
	type InjectionMode,
} from './core/extensions';
import { sampleFavorites } from './favorites/store';
import { createTranslator, resolveLang, type I18nKey, type Translator } from './i18n';
import { MathBoxModal } from './panel/MathBoxModal';
import { DEFAULT_SETTINGS, MathBoxSettingTab, normalizeSettings } from './settings';
import type { FavoriteItem, InsertMode, Lang, MathBoxSettings, OpenSource, PanelRect } from './types';

export interface OpenPanelOptions {
	source: OpenSource;
	editor?: Editor | null;
	prefill?: string;
}

export default class MathBoxPlugin extends Plugin {
	settings: MathBoxSettings = { ...DEFAULT_SETTINGS };
	lang: Lang = 'zh';
	translator: Translator = createTranslator('zh');
	/** 最近一次扩展包注入通道（供设置页展示） */
	extensionMode: InjectionMode = 'none';

	private panel: MathBoxModal | null = null;

	private readonly saveDebounced: Debounced<[]> = createDebounce(() => {
		void this.saveSettings();
	}, SAVE_DEBOUNCE_MS);

	async onload(): Promise<void> {
		await this.loadSettings();
		this.refreshLanguage();

		// 启动扩展包：必须在 MathJax 初始化前写入 window.MathJax（详见 core/extensions.ts）
		// 宿主会用「整体赋值 window.MathJax」的方式写自己的配置，这里接管该赋值，
		// 宿主一写入就立刻合并我们的扩展包配置，随后 MathJax 启动即读到合并结果
		installMathJaxConfigGuard(() => this.settings.extensions);
		this.installExtensions();

		// 注册工作区视图：面板可成为标签页（吸附）或独立窗口（moveLeafToPopout）
		this.registerView(MATHBOX_VIEW_TYPE, (leaf) => new MathBoxView(leaf, this));

		// 仅注册入口，面板与符号表全部懒初始化（onload 目标 < 10 ms）
		registerCommands(this);
		this.addSettingTab(new MathBoxSettingTab(this.app, this));
	}

	onunload(): void {
		this.saveDebounced.flush();
		this.panel?.close();
		this.panel = null;
	}

	// ------------------------------------------------------------------ 翻译

	/** 翻译函数（语言切换后立即生效） */
	t(key: I18nKey, vars?: Record<string, string | number>): string {
		return this.translator(key, vars);
	}

	/** 语言设置变更后调用 */
	applyLanguage(): void {
		this.refreshLanguage();
	}

	private refreshLanguage(): void {
		this.lang = resolveLang(this.settings.lang, moment.locale());
		this.translator = createTranslator(this.lang);
	}

	// -------------------------------------------------------------- 数据持久化

	async loadSettings(): Promise<void> {
		this.settings = normalizeSettings(await this.loadData());
		// 首次使用（收藏夹为空且从未播种过）写入三大分组的示例收藏，
		// 既方便验证分组跳转，也作为分组结构的样例；删完后不会复活。
		if (this.settings.favorites.length === 0 && this.settings.samplesSeeded !== true) {
			this.settings.favorites = sampleFavorites(resolveLang(this.settings.lang, moment.locale()));
			this.settings.samplesSeeded = true;
			await this.saveSettings();
		}
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}

	/** 防抖落盘（设置 / 收藏变更） */
	queueSave(): void {
		this.saveDebounced();
	}

	setFavorites(list: FavoriteItem[]): void {
		this.settings.favorites = list;
		this.queueSave();
	}

	/** 记录最近一次插入方式，供 Ctrl/Cmd+Enter 复现 */
	rememberInsertMode(mode: InsertMode): void {
		if (this.settings.insertMode === mode) return;
		this.settings.insertMode = mode;
		this.queueSave();
	}

	// -------------------------------------------------------------- 扩展包注入

	/** 按当前设置把 TeX 扩展包写入 window.MathJax */
	installExtensions(): void {
		try {
			this.extensionMode = applyExtensionInjection(this.settings.extensions).mode;
			// 宿主会用整体覆盖的方式写 window.MathJax，故在其之后择机补写一次
			scheduleDeferredInjection(this.settings.extensions);
		} catch {
			this.extensionMode = 'none';
		}
	}

	/** 面板几何变更后落盘 */
	rememberPanelRect(rect: PanelRect): void {
		this.settings.panelRect = rect;
		this.queueSave();
	}

	// ------------------------------------------------------------ 面板（单例）

	openPanel(options: OpenPanelOptions): void {
		if (this.panel) {
			new Notice(this.t('toast.panelAlreadyOpen'));
			return;
		}

		const editor =
			options.editor ??
			this.app.workspace.getActiveViewOfType(MarkdownView)?.editor ??
			null;

		const modal = new MathBoxModal(this.app, this, {
			editor,
			...(options.prefill ? { prefill: options.prefill } : {}),
		});
		this.panel = modal;
		modal.open();
	}

	/** 由面板在关闭时回调，解除单例引用 */
	notifyPanelClosed(modal: MathBoxModal): void {
		if (this.panel === modal) this.panel = null;
	}
}
