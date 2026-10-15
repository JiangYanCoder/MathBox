/**
 * 构建体积门禁：main.js 必须 ≤ 300 KB
 *
 * 2026-10-15 由 150 KB 放宽到 300 KB：符号面板走「编译期预渲染」路线后，
 * 符号片段（~106 KB）+ 字符 CSS（~17 KB）内联进 main.js，取代运行时排版。
 * 详见 scripts/prerender-symbols.mjs 文件头说明。
 */

import { statSync } from 'node:fs';

const GATE_KB = 300;
const FILE = 'main.js';

try {
	const bytes = statSync(FILE).size;
	const kb = bytes / 1024;
	const pretty = kb.toFixed(1);
	if (kb > GATE_KB) {
		console.error(`[size gate] FAIL  ${FILE} = ${pretty} KB (limit ${GATE_KB} KB)`);
		process.exit(1);
	}
	console.log(`[size gate] OK    ${FILE} = ${pretty} KB (limit ${GATE_KB} KB)`);
} catch {
	console.error(`[size gate] FAIL  ${FILE} not found — run the build first`);
	process.exit(1);
}
