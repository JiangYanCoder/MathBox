/**
 * 构建体积门禁：main.js 必须 ≤ 150 KB
 * 与设计文档 §10 性能设计保持一致。
 */

import { statSync } from 'node:fs';

const GATE_KB = 150;
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
