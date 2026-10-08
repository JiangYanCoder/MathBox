/**
 * 一键打包：编译 → 组装 release/ 四文件 → 同步部署到本插件目录
 *
 * 产物（标准 Obsidian 插件结构，四文件）：
 *   release/main.js       生产构建（esbuild minify + 150 KB 门禁）
 *   release/manifest.json 插件清单（id = obsidian-math-box）
 *   release/styles.css    样式（Obsidian 约定命名，宿主自动加载）
 *   release/data.json     默认设置种子（最小集，运行时经 normalizeSettings 补全）
 *
 * 部署：main.js / manifest.json / styles.css 覆盖到插件根目录；
 *       data.json 仅在插件目录不存在时部署（保护运行期用户设置不被覆盖）。
 */

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import process from 'process';

const NODE = process.execPath;
const run = (cmd, args) => {
	const result = spawnSync(cmd, args, { stdio: 'inherit', shell: false });
	if (result.status !== 0) {
		console.error(`[package] FAIL  ${args.join(' ')}`);
		process.exit(result.status ?? 1);
	}
};

// 1. 编译 + 体积门禁（tsc 由 npm run build 统一驱动，此处复用）
run(NODE, ['node_modules/typescript/bin/tsc', '-noEmit', '-skipLibCheck']);
run(NODE, ['esbuild.config.mjs', 'production']);
run(NODE, ['scripts/check-size.mjs']);

// 2. 组装 release/
mkdirSync('release', { recursive: true });
for (const file of ['main.js', 'manifest.json', 'styles.css']) {
	copyFileSync(file, `release/${file}`);
	const kb = (statSync(`release/${file}`).size / 1024).toFixed(1);
	console.log(`[package] copy  release/${file} (${kb} KB)`);
}

// data.json：默认设置种子（最小集）。运行时 loadSettings 走
// normalizeSettings(loadData()) 与 DEFAULT_SETTINGS 合并，故无需展开全部字段。
const seed = JSON.parse(readFileSync('scripts/default-data.json', 'utf8'));
writeFileSync('release/data.json', `${JSON.stringify(seed, null, 2)}\n`);
console.log('[package] write release/data.json (default settings seed)');

// 3. 同步部署到插件根目录（测试库运行环境）
for (const file of ['main.js', 'manifest.json', 'styles.css']) {
	copyFileSync(`release/${file}`, file);
	console.log(`[package] deploy ${file}`);
}
if (!existsSync('data.json')) {
	copyFileSync('release/data.json', 'data.json');
	console.log('[package] deploy data.json (首次安装种子)');
} else {
	console.log('[package] skip  data.json — 运行期设置已存在，不覆盖');
}

console.log('[package] DONE   release/ 四文件就绪');
