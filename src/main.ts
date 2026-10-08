/**
 * MathBox 插件入口
 *
 * 职责边界（遵循 AGENTS.md）：本文件只做插件生命周期与跨模块编排，
 * 具体功能分散在 core / i18n / symbols / templates / favorites / exporter / panel / commands。
 */

import { Editor, MarkdownView, Notice, Plugin, moment, type Tasks } from 'obsidian';
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

	/** 是否有尚未落盘的设置变更（防抖窗口内为 true，写入成功后复位） */
	private saveDirty = false;

	/**
	 * 防抖落盘器。回调内记录并吞掉异常：后台写盘失败既不该打断用户操作，
	 * 也不该产生未处理的 Promise 拒绝。
	 */
	private readonly saveDebounced: Debounced<[]> = createDebounce(() => {
		void this.saveSettings().catch((error: unknown) => {
			console.error('[MathBox] 设置落盘失败', error);
		});
	}, SAVE_DEBOUNCE_MS);

	async onload(): Promise<void> {
		await this.loadSettings();
		this.refreshLanguage();

		// app 退出前保证最后一次变更落盘：宿主会等待 quit 事件加入的任务，
		// 而 onunload 是同步方法、无法 await 防抖中的写入（见 flushPendingSave）
		this.registerEvent(
			this.app.workspace.on('quit', (tasks) => this.flushPendingSave(tasks)),
		);

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
		// 同步 flush：让最后一次变更尽早发出（此刻渲染进程仍在，Promise 会正常完成）；
		// app 退出这条路径由 onload 注册的 quit 处理器兜住，见 flushPendingSave
		this.flushPendingSave();
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
		// 写成功才复位脏标记：失败时保留，交给 quit 任务或下一次变更重试
		this.saveDirty = false;
	}

	/** 防抖落盘（设置 / 收藏变更） */
	queueSave(): void {
		this.saveDirty = true;
		this.saveDebounced();
	}

	/**
	 * 立即落盘尚未写入的变更。
	 *
	 * 背景：`queueSave` 是 500 ms 防抖，而宿主 `onunload(): void` 是同步方法、
	 * 无法 await `saveData()`——插件卸载或 app 退出时，防抖窗口内的最后一次变更
	 * 可能永远不会写进 data.json。两处兜底：
	 *  · 卸载时：取消防抖并立即发起写入（渲染进程仍在，Promise 来得及完成）；
	 *  · app 退出时：把同一个写入 Promise 交给 workspace 'quit' 的任务队列，
	 *    宿主会等它结束再退出（关闭 app 时唯一可靠的时机）。
	 *
	 * 无待写入变更时直接返回，不做多余写盘；写盘异常只记录，不冒进宿主的退出流程。
	 */
	private flushPendingSave(tasks?: Tasks): void {
		if (!this.saveDirty) return;
		this.saveDebounced.cancel(); // 取消防抖，避免与下面这次写入重复
		const pending = this.saveSettings().catch((error: unknown) => {
			console.error('[MathBox] 设置落盘失败', error);
		});
		if (tasks) tasks.addPromise(pending);
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
