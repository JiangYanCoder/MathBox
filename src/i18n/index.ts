/**
 * 国际化入口（不得 import "obsidian"，保证核心层可独立单测）
 */

import { zh, type I18nKey } from './zh';
import { en } from './en';
import type { Lang, LangSetting } from '../types';

export type { I18nKey };
export { zh, en };

const TABLES: Record<Lang, Record<I18nKey, string>> = { zh, en };

export type Translator = (key: I18nKey, vars?: Record<string, string | number>) => string;

/** 把 `{name}` 占位符替换为实际值 */
export function format(template: string, vars?: Record<string, string | number>): string {
	if (!vars) return template;
	return template.replace(/\{(\w+)\}/g, (match, name: string) => {
		const value = vars[name];
		return value === undefined ? match : String(value);
	});
}

/** 创建指定语言的翻译函数 */
export function createTranslator(lang: Lang): Translator {
	const table = TABLES[lang] ?? zh;
	return (key, vars) => format(table[key] ?? key, vars);
}

/**
 * 解析生效语言。
 * `auto` 时依据宿主界面语言判断（入参为宿主语言标识，如 "zh" / "zh-cn" / "en"）。
 */
export function resolveLang(setting: LangSetting, hostLocale: string | null | undefined): Lang {
	if (setting === 'zh' || setting === 'en') return setting;
	const locale = (hostLocale ?? '').toLowerCase();
	if (locale.startsWith('zh')) return 'zh';
	if (locale) return 'en';
	return 'zh';
}
