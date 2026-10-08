/**
 * D 区：可展开侧边栏（快捷工具 / 公式模板 / 收藏夹）
 *
 * 布局：标签行 → 分组控制行（分组选择按钮）→ 内容体（全部分组纵向排列）
 *
 * 三个标签页共用同一套分组交互（v3.2 定稿）：
 *  · 页顶一个「分组选择按钮」，点击弹出全部分组的列表；
 *  · 点选列表项 = **快速跳转**：内容区滚动到该分组标题处，
 *    内容区始终保留全部分组（不再只显示一个分组）；
 *  · 手动滚动内容区时反向联动（scroll spy）：按钮文案与列表高亮同步切换；
 *  · 分组只有一项时同样可弹出（列表仅一行），交互行为不退化。
 *
 * 收藏夹另有两项附加能力：搜索框、「全部 / 置顶 / 最近使用」过滤。
 *
 * 说明：v3.0 布局规格以「快捷工具 → 公式模板 → 收藏夹」为标签顺序，
 * 收藏夹不再置于首位（该处修订自 MathPalette 时期的约定，见设计文档 §3.2 D 区）。
 */

import { CURSOR } from '../../core/constants';
import {
	bucketFavorites,
	collectGroups,
	favoriteGroupOptions,
	groupIdOf,
	hasGroup,
	removeFavorite,
	renameFavorite,
	searchFavorites,
	setFavoriteGroup,
	togglePin,
	touchFavorite,
	UNGROUPED_ID,
} from '../../favorites/store';
import { SYMBOL_GROUPS } from '../../symbols';
import { TEMPLATE_GROUPS } from '../../templates';
import type { FavoriteItem } from '../../types';
import { GroupManagerModal } from '../groupManagerDialog';
import { MatrixSizeModal } from '../matrixDialog';
import { PromptModal } from '../favoriteDialog';
import { iconButton, Icons, makeEl } from '../ui';
import type { PanelContext } from './context';
import { createGroupSelect, type GroupSelectApi } from './groupSelect';

// ---------------------------------------------------------------- 类型

export type SideTab = 'symbols' | 'templates' | 'favorites';

/** 收藏夹过滤（与分组跳转是两种语义，二者可叠加） */
type FavFilter = 'all' | 'pinned' | 'recent';

export interface SideSectionApi {
	el: HTMLElement;
	refreshFavorites(): void;
}

/** 东亚宽字符视作两列宽 */
const WIDE_CHAR = /[\u1100-\u115F\u2E80-\u303E\u3041-\u33FF\u3400-\u4DBF\u4E00-\u9FFF\uA000-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE6F\uFF00-\uFF60\uFFE0-\uFFE6]/;

/**
 * 符号按钮应占的列数：按显示宽度分档（1 / 2 / 3 列），
 * 使「\lim」「\sum_{i=1}^{n}」这类长条目不再被挤成等宽小格。
 */
function symbolSpan(label: string): number {
	let width = 0;
	for (const ch of label) width += WIDE_CHAR.test(ch) ? 2 : 1;
	if (width <= 2) return 1;
	if (width <= 5) return 2;
	return 3;
}

// ---------------------------------------------------------------- 主构建

export function createSideSection(
	ctx: PanelContext,
	initialTab: SideTab = 'symbols',
): SideSectionApi {
	const t = ctx.t;

	// ---- 骨架：标签行 / 分组控制行 / 搜索行 / 内容体 ----
	// 搜索行（公式模板、收藏夹的搜索框）**不放在滚动容器内**，
	// 而是与分组跳转按钮同级：滚动时列表独立滚动，搜索框始终可见，
	// 且左右边缘天然与分组跳转按钮共边（同一父级 + 同一水平内边距）。
	const el = makeEl('aside', { cls: 'mathbox-sidepane' });
	const tabBar = makeEl('div', { cls: 'mathbox-side-tabs', parent: el });
	const chipBar = makeEl('div', { cls: 'mathbox-side-chips', parent: el });
	/** 搜索行容器：快捷工具页不显示（置空即可） */
	const searchRow = makeEl('div', { cls: 'mathbox-side-searchrow', parent: el });
	const body = makeEl('div', { cls: 'mathbox-side-body', parent: el });

	const tabDefs: ReadonlyArray<{ id: SideTab; label: string }> = [
		{ id: 'symbols', label: t('side.symbols') },
		{ id: 'templates', label: t('side.templates') },
		{ id: 'favorites', label: t('side.favorites') },
	];

	let currentTab: SideTab = initialTab;
	let favFilter: FavFilter = 'all';
	/** 当前页的分组选择器；切换标签页前销毁（收起下拉并移除监听） */
	let groupSelect: GroupSelectApi | null = null;
	/** 解绑上一页的滚动联动监听（body 元素复用，监听必须成对清理） */
	let spyOff: (() => void) | null = null;
	/** 程序化跳转的联动抑制截止时间（平滑滚动期间不跟随） */
	let spyHoldUntil = 0;

	// ------------------------------------------------------------------ 标签行

	function buildTabs(): void {
		tabBar.replaceChildren();
		for (const def of tabDefs) {
			const btn = makeEl('button', {
				cls: 'mathbox-tab',
				text: def.label,
				attr: { type: 'button' },
				parent: tabBar,
			});
			if (def.id === currentTab) btn.classList.add('is-active');
			btn.addEventListener('click', () => switchTab(def.id));
		}
	}

	function switchTab(tab: SideTab): void {
		currentTab = tab;
		buildTabs();
		renderBody();
	}

	// ------------------------------------------------------------------ 滚动联动

	/**
	 * 分组标题在滚动容器内的布局偏移。
	 * 用 offsetTop 而非 getBoundingClientRect：分组标题是 sticky 的，
	 * 滚动到它上方时 rect 会被“钉”在容器顶部而失真（导致往回跳转失效）。
	 * 容器 .mathbox-side-body 设为 position:relative，使其成为 offsetParent。
	 */
	function offsetOf(target: HTMLElement): number {
		return target.offsetTop;
	}

	function clearSpy(): void {
		spyOff?.();
		spyOff = null;
	}

	/** 绑定滚动监听（成对清理：body 元素复用，重渲染时必须先解绑） */
	function bindScrollSync(sync: () => void): void {
		clearSpy();
		const guarded = (): void => {
			// 程序化跳转后的平滑滚动期间不参与联动，避免把按钮文案
			// 从"刚跳到的分组"改回"滚动路径上途经的分组"
			if (Date.now() < spyHoldUntil) return;
			sync();
		};
		body.addEventListener('scroll', guarded, { passive: true });
		spyOff = () => body.removeEventListener('scroll', guarded);
		guarded();
	}

	/** 绑定 scroll spy：滚到哪个分组，选择按钮就切到哪个分组（同步计算，不依赖 rAF） */
	function bindSpy(anchors: ReadonlyArray<HTMLElement | undefined>, onActive: (index: number) => void): void {
		bindScrollSync(() => {
			const probe = body.scrollTop + 8;
			let active = 0;
			for (let i = 0; i < anchors.length; i += 1) {
				const anchor = anchors[i];
				if (anchor && offsetOf(anchor) <= probe) active = i;
			}
			onActive(active);
		});
	}

	/** 滚动容器平滑滚到目标分组（不支持 scrollTo 选项时退化为直接置位） */
	function scrollToAnchor(anchor: HTMLElement | undefined): void {
		if (!anchor) return;
		const top = Math.max(0, offsetOf(anchor) - 2);
		// 平滑滚动期间抑制联动，落位后由 pick() 设定的分组保持为当前分组
		spyHoldUntil = Date.now() + 700;
		body.scrollTo({ top, behavior: 'smooth' });
	}

	// ------------------------------------------------------------------ 内容体

	function renderBody(): void {
		// 销毁上一页的选择器（收起下拉、移除 document 监听）与滚动联动
		groupSelect?.destroy();
		groupSelect = null;
		clearSpy();
		spyHoldUntil = 0;
		searchRow.replaceChildren();
		searchRow.hidden = true;
		body.replaceChildren();
		body.scrollTop = 0;
		if (currentTab === 'symbols') renderSymbols();
		else if (currentTab === 'templates') renderTemplates();
		else renderFavorites();
	}

	// ------------------------------------------------------------------ 快捷工具页

	/** 自定义矩阵弹窗：输入行列数与环境后插入矩阵骨架 */
	function openMatrixDialog(): void {
		new MatrixSizeModal(ctx.app, {
			title: t('matrix.title'),
			rowsLabel: t('matrix.rows'),
			colsLabel: t('matrix.cols'),
			envLabel: t('matrix.env'),
			okText: t('common.ok'),
			cancelText: t('common.cancel'),
			invalidText: t('matrix.invalid'),
			defaultRows: 2,
			defaultCols: 2,
			defaultEnv: 'bmatrix',
			onSubmit: (latex) => ctx.insertIntoSource(latex),
		}).open();
	}

	/** 快捷工具：分组选择按钮 + 全部分组纵向排列 + 点选跳转 / 滚动联动 */
	function renderSymbols(): void {
		chipBar.replaceChildren();
		chipBar.hidden = false;

		makeEl('div', { cls: 'mathbox-side-hint', text: t('side.symbolsHint'), parent: body });

		const anchors: HTMLElement[] = [];
		for (const group of SYMBOL_GROUPS) {
			const head = makeEl('div', {
				cls: 'mathbox-side-group',
				text: group.name[ctx.lang],
				parent: body,
			});
			anchors.push(head);
			const grid = makeEl('div', { cls: 'mathbox-symbol-grid', parent: body });

			// 数组矩阵分组：首位提供「自定义矩阵」入口（输入行数 / 列数 / 环境）
			if (group.id === 'matrix') {
				const custom = makeEl('button', {
					cls: 'mathbox-symbol is-action',
					text: t('matrix.entry'),
					attr: { type: 'button' },
					parent: grid,
				});
				custom.title = t('matrix.hint');
				custom.addEventListener('click', () => openMatrixDialog());
			}

			for (const item of group.items) {
				const btn = makeEl('button', {
					cls: 'mathbox-symbol',
					text: item.label,
					attr: { type: 'button' },
					parent: grid,
				});
				// 按钮宽度按内容自适应：内容多的项跨更多列（grid-auto-flow:dense
				// 会把后续小按钮回填空隙，整体仍保持整齐）
				const span = symbolSpan(item.label);
				if (span > 1) btn.style.gridColumn = `span ${span}`;
				btn.title = item.latex;
				btn.addEventListener('click', () => ctx.insertIntoSource(item.latex));
			}
		}

		groupSelect = createGroupSelect({
			parent: chipBar,
			items: SYMBOL_GROUPS.map((group) => ({ id: group.id, label: group.name[ctx.lang] })),
			hint: t('side.jumpHint'),
			onSelect: (index) => scrollToAnchor(anchors[index]),
		});
		bindSpy(anchors, (index) => groupSelect?.setCurrent(index));
	}

	// ------------------------------------------------------------------ 公式模板页

	/**
	 * 公式模板：分组选择按钮 + **搜索框** + 全部分组纵向排列 + 点选跳转 / 滚动联动
	 *
	 * 搜索：按模板名称模糊匹配，忽略大小写并去除首尾空格；`input` 事件即时响应
	 * （模板量级约 83 条，无需防抖），清空关键词即恢复完整列表；
	 * 无匹配时显示占位提示，匹配结果的分组标题与滚动联动同步重建。
	 */
	function renderTemplates(): void {
		chipBar.replaceChildren();
		chipBar.hidden = false;

		// ---- 搜索行：挂在滚动容器之外（与分组跳转按钮同级），滚动时始终可见 ----
		searchRow.hidden = false;
		const tools = makeEl('div', { cls: 'mathbox-side-tools', parent: searchRow });
		// 用 .mathbox-tpl-search（无左右外边距）→ 与下方模板列表左右边缘完全对齐
		const search = makeEl('input', {
			cls: 'mathbox-tpl-search',
			parent: tools,
			attr: { type: 'search' },
		});
		search.placeholder = t('tpl.searchPlaceholder');

		const sections = makeEl('div', { cls: 'mathbox-tpl-sections', parent: body });
		/** 当前可见的分组标题（搜索后重建），供跳转与滚动联动使用 */
		let anchors: HTMLElement[] = [];

		const buildTemplate = (item: (typeof TEMPLATE_GROUPS)[number]['items'][number], list: HTMLElement): void => {
			// 用 div + role="button" 而非 <button>：Chromium 对 button 内部使用
			// 匿名盒布局，多行内容（标题 + 代码块）放进去会被裁剪或与相邻条目重叠
			const btn = makeEl('div', {
				cls: 'mathbox-template',
				attr: { role: 'button', tabindex: '0' },
				parent: list,
			});
			btn.title = item.latex.replace(CURSOR, '');
			const nameRow = makeEl('div', { cls: 'mathbox-template-name', parent: btn });
			makeEl('span', { text: item.name[ctx.lang], parent: nameRow });
			if (item.tag) {
				makeEl('span', { cls: 'mathbox-tag', text: item.tag[ctx.lang], parent: nameRow });
			}
			makeEl('div', {
				cls: 'mathbox-template-latex',
				text: item.latex.replace(CURSOR, ''),
				parent: btn,
			});
			btn.addEventListener('click', () => ctx.replaceSourceWith(item.latex));
			// div 形态需自行补键盘可达性（Enter / 空格等同点击）
			btn.addEventListener('keydown', (ev: KeyboardEvent) => {
				if (ev.key !== 'Enter' && ev.key !== ' ') return;
				ev.preventDefault();
				ctx.replaceSourceWith(item.latex);
			});
		};

		const paint = (): void => {
			const q = search.value.trim().toLowerCase();
			sections.replaceChildren();
			anchors = [];
			let matched = 0;

			for (const group of TEMPLATE_GROUPS) {
				// 名称模糊匹配：忽略大小写 + 去首尾空格
				const items = q
					? group.items.filter((item) => item.name[ctx.lang].toLowerCase().includes(q))
					: group.items;
				if (items.length === 0) continue;
				matched += items.length;
				const head = makeEl('div', {
					cls: 'mathbox-side-group',
					text: group.name[ctx.lang],
					parent: sections,
				});
				anchors.push(head);
				const list = makeEl('div', { cls: 'mathbox-template-list', parent: sections });
				for (const item of items) buildTemplate(item, list);
			}

			if (matched === 0) {
				makeEl('div', { cls: 'mathbox-side-hint', text: t('tpl.noResult'), parent: sections });
			}
			// 锚点数量可能变化（搜索过滤），重算一次高亮
			spySync();
		};

		/** 滚动联动：按当前可见分组标题的位置判定所属分组 */
		const spySync = (): void => {
			const probe = body.scrollTop + 8;
			let active = 0;
			anchors.forEach((anchor, index) => {
				if (anchor.offsetTop <= probe) active = index;
			});
			groupSelect?.setCurrent(active);
		};

		groupSelect = createGroupSelect({
			parent: chipBar,
			items: TEMPLATE_GROUPS.map((group) => ({ id: group.id, label: group.name[ctx.lang] })),
			hint: t('side.jumpHint'),
			onSelect: (index) => scrollToAnchor(anchors[index]),
		});
		bindScrollSync(spySync);

		search.addEventListener('input', paint);
		paint();
	}

	// ------------------------------------------------------------------ 收藏夹页

	/** 用户自建分组（预置三大分组之外），存于设置并可在界面上新建 */
	const customGroups = (): string[] => ctx.plugin.settings.favoriteGroups ?? [];

	/** 新建分组：名称校验（空 / 重名）后写入设置并整页重建，新分组即可点选跳转 */
	function createGroup(rawName: string): void {
		const name = rawName.trim();
		if (!name) {
			ctx.notify(t('fav.groupInvalid'), true);
			return;
		}
		if (hasGroup(ctx.getFavorites(), name, customGroups())) {
			ctx.notify(t('fav.groupExists'), true);
			return;
		}
		ctx.plugin.settings.favoriteGroups = [...customGroups(), name];
		ctx.plugin.queueSave();
		ctx.notify(t('fav.groupCreated', { name }));
		renderBody();
	}

	/** 构造一条收藏记录行（主按钮插入 + 置顶 / 重命名改分组 / 删除） */
	function buildFavoriteRow(item: FavoriteItem): HTMLElement {
		const row = makeEl('div', { cls: 'mathbox-fav-item' });
		row.title = item.latex;

		// 同模板条目：div + role="button"，避免 button 匿名盒裁剪多行内容
		const main = makeEl('div', {
			cls: 'mathbox-fav-main',
			attr: { role: 'button', tabindex: '0' },
			parent: row,
		});
		makeEl('div', { cls: 'mathbox-fav-name', text: item.name, parent: main });
		makeEl('div', { cls: 'mathbox-fav-latex', text: item.latex, parent: main });
		main.addEventListener('click', () => {
			ctx.insertIntoSource(item.latex);
			ctx.mutateFavorites((list) => touchFavorite(list, item.id));
			ctx.notify(t('fav.inserted'));
		});
		main.addEventListener('keydown', (ev: KeyboardEvent) => {
			if (ev.key !== 'Enter' && ev.key !== ' ') return;
			ev.preventDefault();
			main.click();
		});

		const actions = makeEl('div', { cls: 'mathbox-fav-actions', parent: row });

		const pinned = item.pinned === true;
		const pinBtn = iconButton(pinned ? Icons.unpin : Icons.pin, pinned ? t('fav.unpin') : t('fav.pin'), {
			parent: actions,
		});
		pinBtn.addEventListener('click', () => ctx.mutateFavorites((list) => togglePin(list, item.id)));

		const renameBtn = iconButton(Icons.pencil, t('common.rename'), { parent: actions });
		renameBtn.addEventListener('click', () => {
			new PromptModal(ctx.app, {
				title: t('fav.renameTitle'),
				value: item.name,
				okText: t('common.ok'),
				cancelText: t('common.cancel'),
				group: {
					label: t('fav.groupLabel'),
					options: favoriteGroupOptions(ctx.getFavorites(), ctx.lang, customGroups()),
					value: groupIdOf(item),
					allowCreate: true,
					createLabel: t('fav.newGroupOption'),
					createPlaceholder: t('fav.newGroupPlaceholder'),
				},
				onSubmit: (value, group) =>
					ctx.mutateFavorites((list) =>
						setFavoriteGroup(renameFavorite(list, item.id, value), item.id, group ?? UNGROUPED_ID),
					),
			}).open();
		});

		const deleteBtn = iconButton(Icons.trash, t('common.delete'), { parent: actions });
		deleteBtn.addEventListener('click', () => {
			ctx.mutateFavorites((list) => removeFavorite(list, item.id));
			ctx.notify(t('fav.removed'));
		});

		return row;
	}

	/** 应用过滤：置顶筛选 / 最近使用（usedAt 倒序前 20 条） */
	function applyFilter(items: readonly FavoriteItem[]): FavoriteItem[] {
		if (favFilter === 'pinned') return items.filter((item) => item.pinned === true);
		if (favFilter === 'recent') {
			return [...items]
				.sort((a, b) => (b.usedAt ?? 0) - (a.usedAt ?? 0))
				.slice(0, 20);
		}
		return [...items];
	}

	/**
	 * 收藏夹：分组选择按钮（跳转）+ 搜索框 + 过滤 chips + 分节列表。
	 * 分组集合取自收藏数据本身（预置分组恒在），过滤与搜索不改变分组集合。
	 */
	function renderFavorites(): void {
		chipBar.replaceChildren();
		chipBar.hidden = false;
		searchRow.hidden = false;

		const all = ctx.getFavorites();
		const defs = collectGroups(all, customGroups());

		// ---- 搜索框与筛选行：均固定在顶部（挂在 searchRow 槽内，滚动容器之外） ----
		// 二者同处槽内、依次纵向排列：搜索框在上、筛选 chips 在下；
		// 下方分组列表独立滚动，筛选 / 排序 / 新建分组 / 管理分组入口始终可见。
		const searchLine = makeEl('div', { cls: 'mathbox-fav-search-row', parent: searchRow });
		const search = makeEl('input', {
			cls: 'mathbox-fav-search',
			parent: searchLine,
			attr: { type: 'search' },
		});
		search.placeholder = t('fav.searchPlaceholder');

		// 筛选行同样脱离滚动容器：与搜索框一起固定在顶部，
		// 分组列表滚动时筛选/排序按钮与新建分组、管理分组入口始终可见可点
		const filterRow = makeEl('div', { cls: 'mathbox-fav-filters', parent: searchRow });
		const filterDefs: ReadonlyArray<{ id: FavFilter; label: string }> = [
			{ id: 'all', label: t('fav.filterAll') },
			{ id: 'pinned', label: t('fav.filterPinned') },
			{ id: 'recent', label: t('fav.filterRecent') },
		];
		const paintFilters = (): void => {
			filterRow.replaceChildren();
			for (const def of filterDefs) {
				const chip = makeEl('button', {
					cls: `mathbox-chip${def.id === favFilter ? ' is-active' : ''}`,
					text: def.label,
					attr: { type: 'button' },
					parent: filterRow,
				});
				chip.addEventListener('click', () => {
					favFilter = def.id;
					paintFilters();
					paint();
				});
			}

			// 「+ 新建分组」：写入设置的 favoriteGroups 后整页重建（新分组即可点选跳转）
			const newGroupBtn = makeEl('button', {
				cls: 'mathbox-chip is-accent',
				text: t('fav.newGroup'),
				attr: { type: 'button' },
				parent: filterRow,
			});
			newGroupBtn.title = t('fav.newGroupTitle');
			newGroupBtn.addEventListener('click', () => {
				new PromptModal(ctx.app, {
					title: t('fav.newGroupTitle'),
					placeholder: t('fav.newGroupPlaceholder'),
					okText: t('common.ok'),
					cancelText: t('common.cancel'),
					onSubmit: (name) => createGroup(name),
				}).open();
			});

			// 「管理分组」：删除分组（单个 / 批量），默认分组受保护
			const manageBtn = makeEl('button', {
				cls: 'mathbox-chip is-accent',
				text: t('fav.manageGroups'),
				attr: { type: 'button' },
				parent: filterRow,
			});
			manageBtn.title = t('fav.manageGroupsHint');
			manageBtn.addEventListener('click', openGroupManager);
		};

		/** 打开分组管理弹窗（删除分组） */
		function openGroupManager(): void {
			new GroupManagerModal(ctx.app, {
				lang: ctx.lang,
				customGroups: customGroups(),
				items: ctx.getFavorites(),
				labels: {
					title: t('fav.manageGroups'),
					empty: t('fav.manageEmpty'),
					selectAll: t('fav.selectAll'),
					protectedHint: t('fav.protectedHint'),
					presetTag: t('fav.presetTag'),
					itemsCount: (n) => t('fav.groupItemsCount', { n }),
					deleteOne: t('fav.deleteGroup'),
					keepItems: t('fav.keepItems'),
					deleteItems: t('fav.deleteItems'),
					itemsPolicy: t('fav.itemsPolicy'),
					deleteSelected: t('fav.deleteSelected'),
					confirmTitle: t('fav.confirmDeleteTitle'),
					confirmMessage: (names, n, cascade) =>
						t(cascade === 'delete-items' ? 'fav.confirmDeleteCascade' : 'fav.confirmDeleteKeep', {
							names: names.join('、'),
							n,
						}),
					okText: t('common.delete'),
					cancelText: t('common.cancel'),
					deleted: (g, n) =>
						n > 0 ? t('fav.groupsDeletedWithItems', { g, n }) : t('fav.groupsDeleted', { g }),
					failed: t('fav.deleteFailed'),
				},
				onDelete: (targets, cascade) => ctx.deleteFavoriteGroups(targets, cascade),
			}).open();
		}


		// ---- 分节列表 ----
		const sections = makeEl('div', { cls: 'mathbox-fav-groups', parent: body });
		const anchors = new Map<string, HTMLElement>();

		const paint = (): void => {
			sections.replaceChildren();
			anchors.clear();

			const found = searchFavorites(ctx.getFavorites(), search.value);
			const buckets = bucketFavorites(applyFilter(found), defs);

			if (ctx.getFavorites().length === 0) {
				makeEl('div', { cls: 'mathbox-side-hint', text: t('fav.empty'), parent: sections });
			}

			for (const bucket of buckets) {
				const head = makeEl('div', {
					cls: 'mathbox-side-group',
					text: bucket.def.name[ctx.lang],
					parent: sections,
				});
				anchors.set(bucket.def.id, head);
				if (bucket.items.length === 0) {
					makeEl('div', { cls: 'mathbox-side-hint', text: t('fav.groupEmpty'), parent: sections });
					continue;
				}
				for (const item of bucket.items) sections.appendChild(buildFavoriteRow(item));
			}

			// 搜索/过滤会改变可滚动高度，锚点重建后同步一次高亮
			spySync();
		};

		// ---- 分组选择按钮：点选跳转到该分组 ----
		groupSelect = createGroupSelect({
			parent: chipBar,
			items: defs.map((def) => ({ id: def.id, label: def.name[ctx.lang] })),
			hint: t('fav.groupHint'),
			onSelect: (index) => scrollToAnchor(anchors.get(defs[index]?.id ?? '')),
		});

		/** 滚动联动：按当前可见分组标题的纵向位置判定所属分组 */
		const spySync = (): void => {
			const probe = body.scrollTop + 8;
			let active = 0;
			defs.forEach((def, index) => {
				const anchor = anchors.get(def.id);
				if (anchor && offsetOf(anchor) <= probe) active = index;
			});
			groupSelect?.setCurrent(active);
		};
		bindScrollSync(spySync);

		paintFilters();
		search.addEventListener('input', paint);
		paint();
	}

	// ------------------------------------------------------------------ 启动

	buildTabs();
	renderBody();

	return {
		el,
		refreshFavorites(): void {
			if (currentTab === 'favorites') renderBody();
		},
	};
}
