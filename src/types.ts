/**
 * MathBox 共享类型定义
 */

/** 公式插入方式 */
export type InsertMode = 'inline' | 'display';

/** 界面语言设置（auto 跟随 Obsidian 界面语言） */
export type LangSetting = 'auto' | 'zh' | 'en';

/** 面板几何（拖拽 / 缩放后持久化） */
export interface PanelRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** 实际生效的语言 */
export type Lang = 'zh' | 'en';

/** 公式排版样式快照 */
export interface FormulaStyle {
	/** LaTeX 字号命令，空字符串表示默认 */
	fontSize: string;
	/** LaTeX 字体命令，空字符串表示默认 */
	font: string;
	/** 颜色名或 #RRGGBB，空字符串表示默认 */
	color: string;
}

/** 收藏夹条目 */
export interface FavoriteItem {
	id: string;
	name: string;
	latex: string;
	style: FormulaStyle;
	createdAt: number;
	usedAt: number;
	/** 置顶 */
	pinned?: boolean;
	/** 所属分组 id（见 favorites/store.ts 的 FAVORITE_GROUP_PRESETS）；缺省为未分组 */
	group?: string;
}

/** 收藏夹分组定义（id + 双语名） */
export interface FavoriteGroupDef {
	id: string;
	name: Bilingual;
}

/** 插件设置 / data.json 结构 */
export interface MathBoxSettings {
	schemaVersion: number;
	favorites: FavoriteItem[];
	/** 最近一次使用的插入方式（Ctrl/Cmd+Enter 复现） */
	insertMode: InsertMode;
	/** 插入时展开非标准宏（physics 等），保证笔记可移植 */
	expandMacros: boolean;
	/** 行间公式是否紧凑（单行 $$x$$）；false 为独立成行 */
	compactDisplay: boolean;
	/** 侧边栏展开状态 */
	sidePaneOpen: boolean;
	/** 侧边栏宽度（px），180 ~ 560 */
	sidePaneWidth: number;
	/** 上（渲染）/下（源码）分区比例 0.2 ~ 0.8 */
	splitRatio: number;
	/** 面板几何；null 表示使用居中默认尺寸 */
	panelRect: PanelRect | null;
	/** 启动扩展包开关（扩展包 id → 是否启用） */
	extensions: Record<string, boolean>;
	lang: LangSetting;
	/** 示例收藏是否已写入过（仅首次且收藏夹为空时写入一次，避免删完后复活） */
	samplesSeeded?: boolean;
	/** 用户自建的收藏分组名（预置三大分组之外；名称即分组 id） */
	favoriteGroups?: string[];
}

/** 图标按钮/控件的双语文本 */
export interface Bilingual {
	zh: string;
	en: string;
}

/** 符号面板条目 */
export interface SymbolItem {
	/** 按钮上显示的字符（Unicode），零渲染开销 */
	label: string;
	/** 点击后插入的 LaTeX 命令 */
	latex: string;
}

/** 符号分组 */
export interface SymbolGroup {
	id: string;
	name: Bilingual;
	items: SymbolItem[];
}

/** 公式模板条目 */
export interface TemplateItem {
	name: Bilingual;
	latex: string;
	/** 侧边栏列表上的小字标签，可选 */
	tag?: Bilingual;
}

/** 模板分组 */
export interface TemplateGroup {
	id: string;
	name: Bilingual;
	items: TemplateItem[];
}

/** 导出格式 */
export type ExportFormat = 'latex' | 'mathml' | 'svg' | 'png';

/** 打开面板的来源 */
export type OpenSource = 'ribbon' | 'menu' | 'command';
