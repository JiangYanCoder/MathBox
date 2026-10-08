/**
 * 全局常量（纯数据，不依赖 Obsidian 宿主）
 */

/** 插入光标占位符：符号/模板文本中出现该字符时，插入后光标停在该位置 */
export const CURSOR = '\u0000';

/** 源码输入到渲染的防抖时长 */
export const RENDER_DEBOUNCE_MS = 200;

/** 设置与收藏变更的落盘防抖时长 */
export const SAVE_DEBOUNCE_MS = 500;

/** 源码长度告警阈值（字符） */
export const LONG_SOURCE_WARN = 2000;

/** 侧边栏默认宽度（px），与 styles.css 保持一致（v3.2 由 260 → 300 → 360 → 700，
 *  使模板 / 收藏条目的按钮宽度达到原按钮的 2 倍，标题与 LaTeX 源码都完整显示） */
export const SIDE_PANE_WIDTH = 700;

/** 侧边栏宽度可调范围（px）；上限 780，留出 80 px 调节余量又不至于挤占主区 */
export const SIDE_PANE_MIN_WIDTH = 180;
export const SIDE_PANE_MAX_WIDTH = 780;

/** 面板最小尺寸（px）——缩放下限，保证四区仍可用 */
export const PANEL_MIN_WIDTH = 560;
export const PANEL_MIN_HEIGHT = 380;

/** 上下分栏（渲染区 / 源码区）各自的最小高度（px）——防止某一块被压没 */
export const SPLIT_MIN_PX = 120;

/** 收藏夹悬停预览防抖 */
export const FAVORITE_PREVIEW_MS = 500;

/** 收藏条目超过该数量时启用虚拟滚动 */
export const VIRTUAL_LIST_THRESHOLD = 100;

/** 生产构建 main.js 体积门禁（KB） */
export const MAIN_JS_GATE_KB = 150;

/** PNG 导出缩放倍数 */
export const PNG_SCALE = 3;

/** data.json 当前 schema 版本 */
export const SCHEMA_VERSION = 1;
