/**
 * 插件设置：默认值、规范化/迁移、设置页
 *
 *  · DEFAULT_SETTINGS   —— 首次安装的默认值（也是 data.json 种子的来源）
 *  · normalizeSettings  —— 读取 data.json 后逐字段校验 / 补默认 / 夹取，
 *                          保证旧版本或手改过的设置文件也能安全加载
 *  · MathBoxSettingTab  —— 设置页（常规 / 面板 / 扩展包 / 数据备份四区）
 */

import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import {
	PANEL_MIN_HEIGHT,
	PANEL_MIN_WIDTH,
	SCHEMA_VERSION,
	SIDE_PANE_MAX_WIDTH,
	SIDE_PANE_MIN_WIDTH,
	SIDE_PANE_WIDTH,
} from './core/constants';
import { defaultExtensionMap, EXTENSION_PACKAGES } from './core/extensions';
import { downloadText, pickTextFile, timestampSuffix } from './exporter/download';
import { FAVORITE_GROUP_PRESETS, mergeFavorites, parseImportedFavorites } from './favorites/store';
import type MathBoxPlugin from './main';
import type { InsertMode, LangSetting, MathBoxSettings, PanelRect } from './types';
import { ConfirmModal } from './panel/favoriteDialog';

// ---------------------------------------------------------------- 默认值

export const DEFAULT_SETTINGS: MathBoxSettings = {
	schemaVersion: SCHEMA_VERSION,
	favorites: [],
	insertMode: 'display',
	expandMacros: true,
	compactDisplay: false,
	sidePaneOpen: true,
	sidePaneWidth: SIDE_PANE_WIDTH,
	splitRatio: 0.45,
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
	if (typeof data.sidePaneOpen === 'boolean') settings.sidePaneOpen = data.sidePaneOpen;
	settings.sidePaneWidth = clampNumber(
		toNumber(data.sidePaneWidth, SIDE_PANE_WIDTH),
		SIDE_PANE_MIN_WIDTH,
		SIDE_PANE_MAX_WIDTH,
	);
	settings.splitRatio = Math.min(0.8, Math.max(0.2, toNumber(data.splitRatio, DEFAULT_SETTINGS.splitRatio)));
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
