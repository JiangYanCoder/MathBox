/**
 * 收藏夹纯逻辑（不依赖 Obsidian 宿主，可独立单测）
 * 持久化由 settings 层负责（data.json）。
 *
 * 分组：收藏条目可归入若干分组，侧边栏按分组分节展示，
 * 顶部的分组选择按钮负责「点选跳转 + 滚动联动高亮」。
 */

import type { Bilingual, FavoriteGroupDef, FavoriteItem, FormulaStyle, Lang } from '../types';

const EMPTY_STYLE: FormulaStyle = { fontSize: '', font: '', color: '' };

// ---------------------------------------------------------------- 分组定义

/** 未分组的哨兵 id（条目 group 缺省或为空时归入此组） */
export const UNGROUPED_ID = '__ungrouped__';

/**
 * 受保护分组（不可删除）：仅「未分组」——它是条目 group 缺省时的归属地，
 * 删除会让所有未归类条目失去去处。**预置分组（最优控制 / 自动控制 / 轨道力学）
 * 不在受保护之列**，可由用户删除。
 */
export const PROTECTED_GROUP_IDS: readonly string[] = [UNGROUPED_ID];

/** 该分组是否受保护（UI 禁用删除键 + 数据层二次校验都以此为准） */
export function isProtectedGroup(id: string): boolean {
	return PROTECTED_GROUP_IDS.includes(id);
}

/**
 * 预置分组：王先生指定的三个测试分组（最优控制 / 自动控制 / 轨道力学）。
 * 始终出现在侧边栏分组列表中，即使分组内暂无收藏，便于点选跳转测试。
 */
export const FAVORITE_GROUP_PRESETS: readonly FavoriteGroupDef[] = [
	{ id: 'optimal-control', name: { zh: '最优控制', en: 'Optimal control' } },
	{ id: 'automatic-control', name: { zh: '自动控制', en: 'Automatic control' } },
	{ id: 'orbital-mechanics', name: { zh: '轨道力学', en: 'Orbital mechanics' } },
];

/** 未分组的展示定义（排序时永远排在最后） */
export const UNGROUPED_GROUP: FavoriteGroupDef = {
	id: UNGROUPED_ID,
	name: { zh: '未分组', en: 'Ungrouped' },
};

/** 条目所属分组 id（空值统一归一为未分组） */
export function groupIdOf(item: FavoriteItem): string {
	return item.group && item.group !== UNGROUPED_ID ? item.group : UNGROUPED_ID;
}

/**
 * 全部分组定义：预置分组 + 用户自建分组（设置里的 favoriteGroups）
 * + 数据中出现的其他分组（未分组单独处理）。
 */
export function collectGroups(
	items: readonly FavoriteItem[],
	extraGroups: readonly string[] = [],
): FavoriteGroupDef[] {
	const defs: FavoriteGroupDef[] = [...FAVORITE_GROUP_PRESETS];
	const known = new Set(defs.map((def) => def.id));

	const push = (id: string): void => {
		if (!id || known.has(id)) return;
		known.add(id);
		defs.push({ id, name: { zh: id, en: id } });
	};

	for (const name of extraGroups) push(name.trim());
	for (const item of items) push(groupIdOf(item) === UNGROUPED_ID ? '' : groupIdOf(item));
	return defs;
}

/** 一个分组及其条目（分节渲染的最小单元） */
export interface FavoriteGroupBucket {
	def: FavoriteGroupDef;
	items: FavoriteItem[];
}

/**
 * 按分组分桶：顺序为「预置分组 → 自定义分组 → 未分组（仅当有条目时）」。
 * 桶内沿用视图排序（置顶优先 → 最近使用靠前）。
 */
export function bucketFavorites(
	items: readonly FavoriteItem[],
	defs: readonly FavoriteGroupDef[] = collectGroups(items),
): FavoriteGroupBucket[] {
	const buckets = new Map<string, FavoriteItem[]>();
	for (const item of items) {
		const gid = groupIdOf(item);
		const bucket = buckets.get(gid);
		if (bucket) bucket.push(item);
		else buckets.set(gid, [item]);
	}

	const out: FavoriteGroupBucket[] = defs.map((def) => ({
		def,
		items: sortFavorites(buckets.get(def.id) ?? []),
	}));
	const rest = buckets.get(UNGROUPED_ID);
	if (rest && rest.length > 0) out.push({ def: UNGROUPED_GROUP, items: sortFavorites(rest) });
	return out;
}

// ---------------------------------------------------------------- 基本操作

/** 由源码生成默认名称（前 20 个字符） */
export function makeDefaultName(latex: string): string {
	const oneLine = latex.replace(/\s+/g, ' ').trim();
	return oneLine.length > 20 ? `${oneLine.slice(0, 20)}…` : oneLine;
}

export function createFavorite(
	latex: string,
	name: string,
	style: FormulaStyle = EMPTY_STYLE,
	group?: string,
): FavoriteItem {
	const now = Date.now();
	const rand = Math.random().toString(36).slice(2, 7);
	return {
		id: `fav_${now}_${rand}`,
		name: name.trim() || makeDefaultName(latex),
		latex: latex.trim(),
		style: { ...style },
		createdAt: now,
		usedAt: now,
		...(group && group !== UNGROUPED_ID ? { group } : {}),
	};
}

/** 按 latex 源码判重（忽略首尾空白） */
export function findDuplicate(list: readonly FavoriteItem[], latex: string): FavoriteItem | null {
	const key = latex.trim();
	return list.find((f) => f.latex === key) ?? null;
}

export function addFavorite(list: readonly FavoriteItem[], item: FavoriteItem): FavoriteItem[] {
	if (findDuplicate(list, item.latex)) return [...list];
	return [item, ...list];
}

export function removeFavorite(list: readonly FavoriteItem[], id: string): FavoriteItem[] {
	return list.filter((f) => f.id !== id);
}

export function renameFavorite(
	list: readonly FavoriteItem[],
	id: string,
	name: string,
): FavoriteItem[] {
	const trimmed = name.trim();
	if (!trimmed) return [...list];
	return list.map((f) => (f.id === id ? { ...f, name: trimmed } : f));
}

export function updateFavoriteLatex(
	list: readonly FavoriteItem[],
	id: string,
	latex: string,
	style: FormulaStyle,
): FavoriteItem[] {
	return list.map((f) =>
		f.id === id ? { ...f, latex: latex.trim(), style: { ...style }, usedAt: Date.now() } : f,
	);
}

export function togglePin(list: readonly FavoriteItem[], id: string): FavoriteItem[] {
	return list.map((f) => (f.id === id ? { ...f, pinned: !f.pinned } : f));
}

/** 移动条目到指定分组（传 UNGROUPED_ID 或空值表示移出分组） */
export function setFavoriteGroup(
	list: readonly FavoriteItem[],
	id: string,
	group: string,
): FavoriteItem[] {
	return list.map((f) => {
		if (f.id !== id) return f;
		const next: FavoriteItem = { ...f };
		if (group && group !== UNGROUPED_ID) next.group = group;
		else delete next.group;
		return next;
	});
}

/** 分组下拉里「新建分组…」选项的哨兵值 */
export const NEW_GROUP_VALUE = '__new_group__';

/** 分组下拉选项：预置分组 + 用户自建分组 + 数据中出现的其他分组 + 未分组 */
export function favoriteGroupOptions(
	items: readonly FavoriteItem[],
	lang: Lang,
	extraGroups: readonly string[] = [],
): Array<{ value: string; label: string }> {
	const options = collectGroups(items, extraGroups).map((def) => ({
		value: def.id,
		label: def.name[lang],
	}));
	options.push({ value: UNGROUPED_ID, label: UNGROUPED_GROUP.name[lang] });
	return options;
}

/** 分组是否已存在（预置 / 自建 / 数据中已使用） */
export function hasGroup(
	items: readonly FavoriteItem[],
	group: string,
	extraGroups: readonly string[] = [],
): boolean {
	if (!group || group === UNGROUPED_ID) return false;
	return collectGroups(items, extraGroups).some((def) => def.id === group);
}

/** 记录一次使用，用于排序 */
export function touchFavorite(list: readonly FavoriteItem[], id: string): FavoriteItem[] {
	const now = Date.now();
	return list.map((f) => (f.id === id ? { ...f, usedAt: now } : f));
}

/** 视图排序：置顶优先 → 最近使用靠前 */
export function sortFavorites(list: readonly FavoriteItem[]): FavoriteItem[] {
	return [...list].sort((a, b) => {
		const pinDiff = Number(b.pinned ?? false) - Number(a.pinned ?? false);
		if (pinDiff !== 0) return pinDiff;
		return b.usedAt - a.usedAt;
	});
}

/** 分组重命名：改的是「名称即 id」的分组，需同步条目上的 group 字段 */
export function renameGroup(
	items: readonly FavoriteItem[],
	groups: readonly string[],
	from: string,
	to: string,
): { items: FavoriteItem[]; groups: string[] } {
	const name = to.trim();
	if (!from || !name || from === name) return { items: [...items], groups: [...groups] };
	if (groups.includes(name)) return { items: [...items], groups: [...groups] };
	return {
		items: items.map((f) => (f.group === from ? { ...f, group: name } : f)),
		groups: groups.map((g) => (g === from ? name : g)),
	};
}

/** 删除分组时的条目处理方式 */
export type GroupCascade = 'keep-items' | 'delete-items';

/**
 * 删除分组（支持单个 / 批量）。
 *
 * · `keep-items`（默认）：分组从列表移除，其条目**移出分组**（`group` 清空，落到「未分组」）；
 * · `delete-items`：分组与其条目一并删除。
 *
 * 受保护分组（仅「未分组」）会被直接忽略——UI 层禁用删除键，数据层在此二次校验，
 * 双层保证无法绕过。
 */
export function removeFavoriteGroups(
	items: readonly FavoriteItem[],
	groups: readonly string[],
	targets: readonly string[],
	cascade: GroupCascade = 'keep-items',
): { items: FavoriteItem[]; groups: string[] } {
	// 已知分组 = 自建分组 ∪ 预置分组（预置分组可删）
	const known = new Set(collectGroups(items, groups).map((def) => def.id));
	const removing = new Set(
		targets.filter((id) => id && !isProtectedGroup(id) && known.has(id)),
	);
	if (removing.size === 0) return { items: [...items], groups: [...groups] };

	const nextGroups = groups.filter((g) => !removing.has(g));
	const nextItems =
		cascade === 'delete-items'
			? items.filter((f) => !removing.has(groupIdOf(f)))
			: items.map((f) => (removing.has(groupIdOf(f)) ? withoutGroup(f) : f));
	return { items: nextItems, groups: nextGroups };
}

/** 去掉条目上的分组字段（移出分组） */
function withoutGroup(item: FavoriteItem): FavoriteItem {
	if (item.group === undefined) return item;
	const next = { ...item };
	delete next.group;
	return next;
}

/** 各分组的条目数（key 为分组 id，含「未分组」；预置分组即使为空也会出现） */
export function countByGroup(
	items: readonly FavoriteItem[],
	groups: readonly string[] = [],
): Map<string, number> {
	const counts = new Map<string, number>();
	for (const g of groups) counts.set(g, 0);
	counts.set(UNGROUPED_ID, 0);
	for (const item of items) {
		const gid = groupIdOf(item);
		counts.set(gid, (counts.get(gid) ?? 0) + 1);
	}
	return counts;
}

/** 名称与源码的模糊搜索（大小写不敏感的子串匹配） */
export function searchFavorites(
	list: readonly FavoriteItem[],
	query: string,
): FavoriteItem[] {
	const q = query.trim().toLowerCase();
	if (!q) return [...list];
	return list.filter(
		(f) => f.name.toLowerCase().includes(q) || f.latex.toLowerCase().includes(q),
	);
}

// ---------------------------------------------------------------- 示例数据

/** 示例收藏的名称（双语，写入时按当前语言取用） */
interface SampleSeed {
	group: string;
	name: Bilingual;
	latex: string;
}

/** 三大分组各 3 条，供分组跳转 / 滚动联动的测试案例 */
const SAMPLE_SEEDS: readonly SampleSeed[] = [
	// 最优控制
	{
		group: 'optimal-control',
		name: { zh: '性能指标泛函', en: 'Cost functional' },
		latex:
			'J = \\varphi\\left(\\boldsymbol{x}(t_f), t_f\\right) + \\int_{t_0}^{t_f} L(\\boldsymbol{x}, \\boldsymbol{u}, t)\\,\\mathrm{d}t',
	},
	{
		group: 'optimal-control',
		name: { zh: '哈密顿函数', en: 'Hamiltonian' },
		latex: 'H = L + \\boldsymbol{\\lambda}^{\\mathrm{T}} \\boldsymbol{f}',
	},
	{
		group: 'optimal-control',
		name: { zh: '协态方程', en: 'Costate equation' },
		latex: '\\dot{\\boldsymbol{\\lambda}} = -\\frac{\\partial H}{\\partial \\boldsymbol{x}}',
	},
	// 自动控制
	{
		group: 'automatic-control',
		name: { zh: '状态空间方程', en: 'State-space model' },
		latex: '\\dot{\\boldsymbol{x}} = \\boldsymbol{A}\\boldsymbol{x} + \\boldsymbol{B}\\boldsymbol{u}',
	},
	{
		group: 'automatic-control',
		name: { zh: '传递函数矩阵', en: 'Transfer matrix' },
		latex:
			'\\boldsymbol{G}(s) = \\boldsymbol{C}(s\\boldsymbol{I} - \\boldsymbol{A})^{-1}\\boldsymbol{B} + \\boldsymbol{D}',
	},
	{
		group: 'automatic-control',
		name: { zh: '闭环特征方程', en: 'Closed-loop characteristic' },
		latex: '\\det\\left(s\\boldsymbol{I} - \\boldsymbol{A} + \\boldsymbol{B}\\boldsymbol{K}\\right) = 0',
	},
	// 轨道力学
	{
		group: 'orbital-mechanics',
		name: { zh: '活力公式', en: 'Vis-viva equation' },
		latex: 'v^2 = \\mu\\left(\\frac{2}{r} - \\frac{1}{a}\\right)',
	},
	{
		group: 'orbital-mechanics',
		name: { zh: '轨道六要素', en: 'Orbital elements' },
		latex: 'a,\\ e,\\ i,\\ \\Omega,\\ \\omega,\\ \\nu',
	},
	{
		group: 'orbital-mechanics',
		name: { zh: '开普勒第三定律', en: "Kepler's third law" },
		latex: 'T = 2\\pi\\sqrt{\\frac{a^3}{\\mu}}',
	},
];

/**
 * 生成 9 条示例收藏（三大分组各 3 条）。
 * id 固定（sample_*），重复调用不会产生新条目；时间倒序以保证列表顺序稳定。
 */
export function sampleFavorites(lang: Lang = 'zh'): FavoriteItem[] {
	const now = Date.now();
	return SAMPLE_SEEDS.map((seed, index) => ({
		id: `sample_${seed.group}_${index}`,
		name: seed.name[lang],
		latex: seed.latex,
		style: { fontSize: '', font: '', color: '' },
		createdAt: now - index * 1000,
		usedAt: now - index * 1000,
		group: seed.group,
	}));
}

// ---------------------------------------------------------------- 导入 / 合并

/** 校验并规范化从 JSON 导入的收藏条目 */
export function parseImportedFavorites(raw: unknown): FavoriteItem[] {
	let source: unknown = raw;
	if (source && typeof source === 'object' && !Array.isArray(source)) {
		source = (source as { favorites?: unknown }).favorites;
	}
	if (!Array.isArray(source)) return [];

	const out: FavoriteItem[] = [];
	for (const entry of source) {
		if (!entry || typeof entry !== 'object') continue;
		const item = entry as Partial<FavoriteItem>;
		if (typeof item.latex !== 'string' || !item.latex.trim()) continue;
		const style = item.style;
		out.push({
			id: typeof item.id === 'string' && item.id ? item.id : createFavorite(item.latex, '').id,
			name: typeof item.name === 'string' && item.name.trim() ? item.name : makeDefaultName(item.latex),
			latex: item.latex.trim(),
			style: {
				fontSize: typeof style?.fontSize === 'string' ? style.fontSize : '',
				font: typeof style?.font === 'string' ? style.font : '',
				color: typeof style?.color === 'string' ? style.color : '',
			},
			createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
			usedAt: typeof item.usedAt === 'number' ? item.usedAt : Date.now(),
			...(item.pinned ? { pinned: true } : {}),
			...(typeof item.group === 'string' && item.group ? { group: item.group } : {}),
		});
	}
	return out;
}

/** 合并导入结果：已有相同源码则跳过 */
export function mergeFavorites(
	current: readonly FavoriteItem[],
	incoming: readonly FavoriteItem[],
): FavoriteItem[] {
	const seen = new Set(current.map((f) => f.latex));
	const merged = [...current];
	for (const item of incoming) {
		if (seen.has(item.latex)) continue;
		seen.add(item.latex);
		merged.push(item);
	}
	return merged;
}
