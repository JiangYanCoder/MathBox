/**
 * 插件设置：默认值、规范化/迁移、设置页
 *
 *  · DEFAULT_SETTINGS   —— 首次安装的默认值（也是 data.json 种子的来源）
 *  · normalizeSettings  —— 读取 data.json 后逐字段校验 / 补默认 / 夹取，
 *                          保证旧版本或手改过的设置文件也能安全加载
 *  · MathBoxSettingTab  —— 设置页（常规 / 面板 / 扩展包 / 数据备份四区）
 */

import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import type { SettingDefinition, SettingDefinitionItem } from 'obsidian';
import {
	PANEL_MIN_HEIGHT,
	PANEL_MIN_WIDTH,
	SCHEMA_VERSION,
	SIDE_PANE_MAX_WIDTH,
	SIDE_PANE_MIN_WIDTH,
	SIDE_PANE_WIDTH,
} from './core/constants';
import { defaultExtensionMap, EXTENSION_PACKAGES } from './core/extensions';
import {
	EDITOR_FONT_SIZE,
	normalizeFontSize,
	PREVIEW_FONT_SIZE,
	type FontSizeSpec,
} from './core/fontSize';
import { downloadText, pickTextFile, timestampSuffix } from './exporter/download';
import { FAVORITE_GROUP_PRESETS, mergeFavorites, parseImportedFavorites } from './favorites/store';
import type MathBoxPlugin from './main';
import type {
	ExportBackground,
	InsertMode,
	LangSetting,
	MathBoxSettings,
	PanelRect,
} from './types';
import { ConfirmModal } from './panel/favoriteDialog';

// ---------------------------------------------------------------- 默认值

export const DEFAULT_SETTINGS: MathBoxSettings = {
	schemaVersion: SCHEMA_VERSION,
	favorites: [],
	insertMode: 'display',
	expandMacros: true,
	compactDisplay: false,
	exportBackground: 'white',
	sidePaneOpen: true,
	sidePaneWidth: SIDE_PANE_WIDTH,
	splitRatio: 0.45,
	// 字号默认值取 v3.4.0 的实测值（预览 1.35em × 13px = 17.55px → 取整 18；编辑 13px）
	previewFontSize: PREVIEW_FONT_SIZE.def,
	editorFontSize: EDITOR_FONT_SIZE.def,
	panelRect: null,
	extensions: defaultExtensionMap(),
	lang: 'auto',
	// 示例收藏仅在「收藏夹为空且从未写入过」时播种一次（见 main.loadSettings）
	samplesSeeded: false,
	// 用户自建分组（预置的最优控制 / 自动控制 / 轨道力学之外）
	favoriteGroups: [],
};

// ---------------------------------------------------------------- 规范化（读入校验 / 迁移）

const LANGS: readonly LangSetting[] = ['auto', 'zh', 'en'];
const INSERT_MODES: readonly InsertMode[] = ['inline', 'display'];

function toNumber(value: unknown, fallback: number): number {
	return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function clampNumber(value: number, min: number, max: number): number {
	if (value < min) return min;
	if (value > max) return max;
	return value;
}

/** 校验并归一化面板几何 */
function normalizeRect(raw: unknown): PanelRect | null {
	if (!raw || typeof raw !== 'object') return null;
	const rect = raw as Partial<PanelRect>;
	const values = [rect.x, rect.y, rect.width, rect.height];
	if (values.some((v) => typeof v !== 'number' || !Number.isFinite(v))) return null;
	return {
		x: rect.x as number,
		y: rect.y as number,
		width: Math.max(PANEL_MIN_WIDTH, rect.width as number),
		height: Math.max(PANEL_MIN_HEIGHT, rect.height as number),
	};
}

/** 读取 data.json 后规范化，并为后续字段演进保留迁移入口 */
export function normalizeSettings(raw: unknown): MathBoxSettings {
	const data = (raw ?? {}) as Partial<MathBoxSettings>;
	const settings: MathBoxSettings = { ...DEFAULT_SETTINGS, favorites: [] };

	if (typeof data.lang === 'string' && (LANGS as readonly string[]).includes(data.lang)) {
		settings.lang = data.lang;
	}
	if (typeof data.insertMode === 'string' && (INSERT_MODES as readonly string[]).includes(data.insertMode)) {
		settings.insertMode = data.insertMode;
	}
	if (typeof data.expandMacros === 'boolean') settings.expandMacros = data.expandMacros;
	if (typeof data.compactDisplay === 'boolean') settings.compactDisplay = data.compactDisplay;
	if (data.exportBackground === 'transparent' || data.exportBackground === 'white') {
		settings.exportBackground = data.exportBackground;
	}
	if (typeof data.sidePaneOpen === 'boolean') settings.sidePaneOpen = data.sidePaneOpen;
	settings.sidePaneWidth = clampNumber(
		toNumber(data.sidePaneWidth, SIDE_PANE_WIDTH),
		SIDE_PANE_MIN_WIDTH,
		SIDE_PANE_MAX_WIDTH,
	);
	settings.splitRatio = Math.min(0.8, Math.max(0.2, toNumber(data.splitRatio, DEFAULT_SETTINGS.splitRatio)));
	settings.previewFontSize = normalizeFontSize(data.previewFontSize, PREVIEW_FONT_SIZE);
	settings.editorFontSize = normalizeFontSize(data.editorFontSize, EDITOR_FONT_SIZE);
	settings.panelRect = normalizeRect(data.panelRect);

	// 扩展包：以默认表为基准合并，未知 id 丢弃、新增 id 补默认值
	const extensions = defaultExtensionMap();
	const incoming = (data.extensions ?? {}) as Record<string, unknown>;
	for (const pkg of EXTENSION_PACKAGES) {
		if (typeof incoming[pkg.id] === 'boolean') extensions[pkg.id] = incoming[pkg.id] as boolean;
	}
	settings.extensions = extensions;

	settings.favorites = parseImportedFavorites(data.favorites);
	if (typeof data.samplesSeeded === 'boolean') settings.samplesSeeded = data.samplesSeeded;
	// 分组表 = 预置分组 + 用户自建分组（预置分组同样可删除，仅「未分组」受保护）
	{
		const seen = new Set<string>(FAVORITE_GROUP_PRESETS.map((p) => p.id));
		if (Array.isArray(data.favoriteGroups)) {
			for (const entry of data.favoriteGroups) {
				if (typeof entry !== 'string') continue;
				const name = entry.trim();
				if (name) seen.add(name);
			}
		}
		settings.favoriteGroups = Array.from(seen);
	}
	settings.schemaVersion = SCHEMA_VERSION;

	return settings;
}

// ---------------------------------------------------------------- 设置页

export class MathBoxSettingTab extends PluginSettingTab {
	private readonly plugin: MathBoxPlugin;

	constructor(app: App, plugin: MathBoxPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		const t = this.plugin.translator;
		containerEl.empty();
		containerEl.classList.add('mathbox-settings');

		addHeading(containerEl, t('settings.lang'));
		new Setting(containerEl)
			.setName(t('settings.lang'))
			.setDesc(t('settings.langDesc'))
			.addDropdown((dd) =>
				dd
					.addOption('auto', t('settings.langAuto'))
					.addOption('zh', t('settings.langZh'))
					.addOption('en', t('settings.langEn'))
					.setValue(this.plugin.settings.lang)
					.onChange(async (value) => {
						this.plugin.settings.lang = value as LangSetting;
						await this.plugin.saveSettings();
						this.plugin.applyLanguage();
						this.display();
					}),
			);

		new Setting(containerEl)
			.setName(t('settings.layoutSection'))
			.setDesc(t('settings.layoutDesc'))
			.addButton((btn) =>
				btn.setButtonText(t('settings.layoutReset')).onClick(() => {
					void this.resetLayout();
				}),
			);

		addHeading(containerEl, t('settings.fontSection'));
		this.addFontSizeSetting(containerEl, {
			name: t('settings.previewFontSize'),
			desc: t('settings.previewFontSizeDesc'),
			spec: PREVIEW_FONT_SIZE,
			get: () => this.plugin.settings.previewFontSize,
			set: (value) => {
				this.plugin.settings.previewFontSize = value;
			},
		});
		this.addFontSizeSetting(containerEl, {
			name: t('settings.editorFontSize'),
			desc: t('settings.editorFontSizeDesc'),
			spec: EDITOR_FONT_SIZE,
			get: () => this.plugin.settings.editorFontSize,
			set: (value) => {
				this.plugin.settings.editorFontSize = value;
			},
		});

		addHeading(containerEl, t('settings.insertSection'));
		new Setting(containerEl)
			.setName(t('settings.expandMacros'))
			.setDesc(t('settings.expandMacrosDesc'))
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.expandMacros).onChange(async (value) => {
					this.plugin.settings.expandMacros = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName(t('settings.compactDisplay'))
			.setDesc(t('settings.compactDisplayDesc'))
			.addToggle((toggle) =>
				toggle.setValue(this.plugin.settings.compactDisplay).onChange(async (value) => {
					this.plugin.settings.compactDisplay = value;
					await this.plugin.saveSettings();
				}),
			);

		new Setting(containerEl)
			.setName(t('settings.exportBackground'))
			.setDesc(t('settings.exportBackgroundDesc'))
			.addDropdown((dropdown) =>
				dropdown
					.addOption('white', t('settings.exportBackgroundWhite'))
					.addOption('transparent', t('settings.exportBackgroundTransparent'))
					.setValue(this.plugin.settings.exportBackground)
					.onChange(async (value) => {
						this.plugin.settings.exportBackground = value as ExportBackground;
						await this.plugin.saveSettings();
					}),
			);

		addHeading(containerEl, t('settings.extSection'));
		const extNote = containerEl.createEl('p', { cls: 'mathbox-settings-note' });
		extNote.setText(t('settings.extDesc'));
		const namingNote = containerEl.createEl('p', { cls: 'mathbox-settings-note is-muted' });
		namingNote.setText(t('settings.extNaming'));

		const lang = this.plugin.lang;
		for (const pkg of EXTENSION_PACKAGES) {
			new Setting(containerEl)
				.setName(pkg.name[lang])
				.setDesc(pkg.desc[lang])
				.addToggle((toggle) =>
					toggle.setValue(this.plugin.settings.extensions[pkg.id] === true).onChange(async (value) => {
						this.plugin.settings.extensions[pkg.id] = value;
						await this.plugin.saveSettings();
						this.plugin.installExtensions();
						new Notice(
							value
								? t('settings.extEnabled', { name: pkg.name[lang] })
								: t('settings.extDisabled', { name: pkg.name[lang] }),
							3000,
						);
					}),
				);
		}

		const status = containerEl.createEl('p', { cls: 'mathbox-settings-note is-muted' });
		status.setText(
			this.plugin.extensionMode === 'preload'
				? t('settings.extStatusPreload')
				: this.plugin.extensionMode === 'postload'
					? t('settings.extStatusPostload')
					: t('settings.extStatusNone'),
		);

		addHeading(containerEl, t('settings.favSection'));
		new Setting(containerEl)
			.setName(t('settings.favCount', { n: this.plugin.settings.favorites.length }))
			.addButton((btn) =>
				btn.setButtonText(t('settings.favExport')).onClick(() => this.exportFavorites()),
			)
			.addButton((btn) =>
				btn.setButtonText(t('settings.favImport')).onClick(() => {
					void this.importFavorites();
				}),
			);

		new Setting(containerEl)
			.setName(t('settings.favClear'))
			.setDesc(t('settings.favClearDesc'))
			.addButton((btn) =>
				btn
					.setWarning()
					.setButtonText(t('settings.favClear'))
					.onClick(() => {
						new ConfirmModal(this.app, {
							title: t('settings.confirmTitle'),
							message: t('settings.favClearConfirm'),
							okText: t('common.ok'),
							cancelText: t('common.cancel'),
							onConfirm: () => {
								this.plugin.setFavorites([]);
								new Notice(t('settings.favCleared'));
								this.display();
							},
						}).open();
					}),
			);

		addHeading(containerEl, t('settings.aboutSection'));
		new Setting(containerEl).setName(t('panel.title')).setDesc(t('settings.aboutDesc'));
	}

	// ------------------------------------------------------------ 声明式设置（Obsidian 1.13+）

	/**
	 * 声明式设置定义（社区审查要求）：让本插件的设置出现在 Obsidian 1.13.0+ 的
	 * **用户设置搜索**中，并由宿主按定义渲染。
	 *
	 * · 旧版本宿主（< 1.13）不会调用本方法，仍走上方 `display()`，行为不变；
	 * · 本方法与 `display()` **共用同一套 i18n 文案与设置字段**，改字段时两处同步；
	 * · 值的读写统一走 `getControlValue` / `setControlValue`，落盘与副作用集中在那里。
	 */
	getSettingDefinitions(): SettingDefinitionItem[] {
		const t = this.plugin.translator;
		const lang = this.plugin.lang;
		const statusText =
			this.plugin.extensionMode === 'preload'
				? t('settings.extStatusPreload')
				: this.plugin.extensionMode === 'postload'
					? t('settings.extStatusPostload')
					: t('settings.extStatusNone');

		const extensionItems: SettingDefinition[] = [
			{ name: t('settings.extDesc'), searchable: false },
			{ name: t('settings.extNaming'), searchable: false },
			...EXTENSION_PACKAGES.map(
				(pkg): SettingDefinition => ({
					name: pkg.name[lang],
					desc: pkg.desc[lang],
					control: { type: 'toggle', key: `extensions.${pkg.id}` },
				}),
			),
			{ name: statusText, searchable: false },
		];

		return [
			{
				type: 'group',
				items: [
					{
						name: t('settings.lang'),
						desc: t('settings.langDesc'),
						control: {
							type: 'dropdown',
							key: 'lang',
							options: {
								auto: t('settings.langAuto'),
								zh: t('settings.langZh'),
								en: t('settings.langEn'),
							},
						},
					},
					{
						name: t('settings.layoutSection'),
						desc: t('settings.layoutDesc'),
						action: () => {
							void this.resetLayout();
						},
					},
				],
			},
			{
				type: 'group',
				heading: t('settings.fontSection'),
				items: [
					{
						name: t('settings.previewFontSize'),
						desc: t('settings.previewFontSizeDesc'),
						control: {
							type: 'number',
							key: 'previewFontSize',
							min: PREVIEW_FONT_SIZE.min,
							max: PREVIEW_FONT_SIZE.max,
							step: 1,
						},
					},
					{
						name: t('settings.editorFontSize'),
						desc: t('settings.editorFontSizeDesc'),
						control: {
							type: 'number',
							key: 'editorFontSize',
							min: EDITOR_FONT_SIZE.min,
							max: EDITOR_FONT_SIZE.max,
							step: 1,
						},
					},
				],
			},
			{
				type: 'group',
				heading: t('settings.insertSection'),
				items: [
					{
						name: t('settings.expandMacros'),
						desc: t('settings.expandMacrosDesc'),
						control: { type: 'toggle', key: 'expandMacros' },
					},
					{
						name: t('settings.compactDisplay'),
						desc: t('settings.compactDisplayDesc'),
						control: { type: 'toggle', key: 'compactDisplay' },
					},
					{
						name: t('settings.exportBackground'),
						desc: t('settings.exportBackgroundDesc'),
						control: {
							type: 'dropdown',
							key: 'exportBackground',
							options: {
								white: t('settings.exportBackgroundWhite'),
								transparent: t('settings.exportBackgroundTransparent'),
							},
						},
					},
				],
			},
			{
				type: 'group',
				heading: t('settings.extSection'),
				items: extensionItems,
			},
			{
				type: 'group',
				heading: t('settings.favSection'),
				items: [
					{ name: t('settings.favCount', { n: this.plugin.settings.favorites.length }), searchable: false },
					{
						name: t('settings.favExport'),
						action: () => this.exportFavorites(),
					},
					{
						name: t('settings.favImport'),
						action: () => {
							void this.importFavorites();
						},
					},
					{
						name: t('settings.favClear'),
						desc: t('settings.favClearDesc'),
						action: () => {
							new ConfirmModal(this.app, {
								title: t('settings.confirmTitle'),
								message: t('settings.favClearConfirm'),
								okText: t('common.ok'),
								cancelText: t('common.cancel'),
								onConfirm: () => {
									this.plugin.setFavorites([]);
									new Notice(t('settings.favCleared'));
									this.refreshDeclarativeView();
								},
							}).open();
						},
					},
				],
			},
			{
				type: 'group',
				heading: t('settings.aboutSection'),
				items: [{ name: t('panel.title'), desc: t('settings.aboutDesc') }],
			},
		];
	}

	/** 声明式控件读值：统一从 `plugin.settings` 取 */
	override getControlValue(key: string): unknown {
		return (this.plugin.settings as unknown as Record<string, unknown>)[key];
	}

	/**
	 * 重渲染声明式设置视图（`SettingTab.update`，1.13+ 才有）。
	 *
	 * `setControlValue` 只会被 1.13+ 的声明式框架调用，`update` 此时必然存在；
	 * 但 lint 的 no-unsupported-api 规则按 minAppVersion=1.5.0 静态判定，直接调用会报错，
	 * 故走能力探测别名。
	 */
	private refreshDeclarativeView(): void {
		const maybeUpdate = (this as unknown as { update?: () => void }).update;
		if (typeof maybeUpdate === 'function') maybeUpdate.call(this);
	}

	/**
	 * 声明式控件写值：归一化 → 写内存 → 落盘 → 副作用。
	 * 键名即设置字段名（扩展包为 `extensions.<id>`），与 data.json 字段一一对应。
	 */
	override setControlValue(key: string, value: unknown): void {
		const t = this.plugin.translator;
		const lang = this.plugin.lang;
		const s = this.plugin.settings as unknown as Record<string, unknown>;

		if (key === 'lang') {
			if (value === 'auto' || value === 'zh' || value === 'en') s.lang = value;
			void this.plugin.saveSettings();
			this.plugin.applyLanguage();
			this.refreshDeclarativeView(); // 语言变了，全部标签需按新文案重渲染
			return;
		}
		if (key === 'previewFontSize') {
			s.previewFontSize = normalizeFontSize(value, PREVIEW_FONT_SIZE);
			void this.plugin.saveSettings();
			return;
		}
		if (key === 'editorFontSize') {
			s.editorFontSize = normalizeFontSize(value, EDITOR_FONT_SIZE);
			void this.plugin.saveSettings();
			return;
		}
		if (key.startsWith('extensions.')) {
			const id = key.slice('extensions.'.length);
			const pkg = EXTENSION_PACKAGES.find((p) => p.id === id);
			s.extensions = { ...this.plugin.settings.extensions, [id]: value === true };
			void this.plugin.saveSettings();
			this.plugin.installExtensions();
			if (pkg) {
				new Notice(
					value === true
						? t('settings.extEnabled', { name: pkg.name[lang] })
						: t('settings.extDisabled', { name: pkg.name[lang] }),
					3000,
				);
			}
			return;
		}
		s[key] = value;
		void this.plugin.saveSettings();
	}

	/**
	 * 字号设置行：`↺` 复位图标 + 数字输入框（px）。
	 *
	 * · 输入即归一化（夹取到区间 / 非法回默认）并落盘；归一化后与输入不一致时回写输入框，
	 *   让用户立刻看到实际生效值（例如填 99 会跳成 30）；
	 * · 前置图标**只复位本行**到软件默认值（预览 18px / 编辑 13px），替代原先的
	 *   「恢复默认字号」整行按钮——两项各自独立，不必为了改一项而重置另一项。
	 */
	private addFontSizeSetting(
		containerEl: HTMLElement,
		options: {
			name: string;
			desc: string;
			spec: FontSizeSpec;
			get(): number;
			set(value: number): void;
		},
	): void {
		const { spec } = options;
		const t = this.plugin.translator;
		const setting = new Setting(containerEl).setName(options.name).setDesc(options.desc);

		// 先加图标按钮、后加输入框 → 控件行内顺序为「↺ | 输入框」
		setting.addExtraButton((btn) =>
			btn
				.setIcon('rotate-ccw')
				.setTooltip(t('settings.fontResetOne', { n: spec.def }))
				.onClick(() => {
					void this.resetFontSize(options);
				}),
		);

		setting.addText((text) => {
			// 宿主 TextComponent 恒有 inputEl；e2e 替身没有该属性，故运行时判定后再改写
			const input: unknown = text.inputEl;
			const isInput = input instanceof HTMLInputElement;
			if (isInput) {
				input.type = 'number';
				input.min = String(spec.min);
				input.max = String(spec.max);
				input.step = '1';
				input.addClass('mathbox-font-input');
				input.setAttribute('aria-label', options.name);
			}
			text.setValue(String(normalizeFontSize(options.get(), spec)));
			text.onChange((raw) => {
				const next = normalizeFontSize(Number.parseFloat(raw), spec);
				options.set(next);
				void this.plugin.saveSettings();
				if (isInput && input.value !== String(next)) input.value = String(next);
			});
		});
	}

	/** 单行字号复位为软件默认值（预览 18px / 编辑 13px） */
	private async resetFontSize(options: {
		spec: FontSizeSpec;
		set(value: number): void;
	}): Promise<void> {
		const t = this.plugin.translator;
		options.set(options.spec.def);
		await this.plugin.saveSettings();
		new Notice(t('settings.fontResetOne', { n: options.spec.def }));
		this.display();
	}

	private async resetLayout(): Promise<void> {
		const t = this.plugin.translator;
		this.plugin.settings.panelRect = null;
		this.plugin.settings.sidePaneWidth = SIDE_PANE_WIDTH;
		this.plugin.settings.splitRatio = DEFAULT_SETTINGS.splitRatio;
		this.plugin.settings.sidePaneOpen = true;
		await this.plugin.saveSettings();
		new Notice(t('settings.layoutResetDone'));
	}

	private exportFavorites(): void {
		const t = this.plugin.translator;
		const payload = {
			schemaVersion: SCHEMA_VERSION,
			favorites: this.plugin.settings.favorites,
		};
		downloadText(
			JSON.stringify(payload, null, 2),
			`mathbox-favorites-${timestampSuffix()}.json`,
			'application/json',
		);
		new Notice(t('fav.exported', { n: this.plugin.settings.favorites.length }));
	}

	private async importFavorites(): Promise<void> {
		const t = this.plugin.translator;
		const text = await pickTextFile('application/json');
		if (!text) return;
		try {
			const parsed = JSON.parse(text) as unknown;
			const incoming = parseImportedFavorites(parsed);
			if (incoming.length === 0) {
				new Notice(t('fav.importFailed'), 4000);
				return;
			}
			this.plugin.setFavorites(
				mergeFavorites(this.plugin.settings.favorites, incoming),
			);
			new Notice(t('fav.imported', { n: incoming.length }));
			this.display();
		} catch {
			new Notice(t('fav.importFailed'), 4000);
		}
	}
}

// ---------------------------------------------------------------- 小工具

function addHeading(host: HTMLElement, text: string): void {
	const heading = createEl('h3');
	heading.className = 'mathbox-settings-heading';
	heading.textContent = text;
	host.appendChild(heading);
}
