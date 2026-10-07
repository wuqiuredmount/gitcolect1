// scripts/pre-commit-check.mjs
// 提交前检查：本次改动是否触及红线清单里的关键文件
// 用途：给 AI + 用户提个醒，不阻塞提交（仅警告）

import { execSync } from 'node:child_process';

// 红线清单里的关键文件（与 .agents/references/red-lines.md 同步）
const RED_LINES = new Set([
  'src/groups/geo/utils/fingerprint.js',
  'src/groups/geo/utils/fingerprintStore.js',
  'src/groups/geo/utils/toolDB.js',
  'src/groups/geo/utils/migrationManager.js',
  'src/groups/geo/utils/annotationStore.js',
  'src/groups/whiteboard/utils/elementSync.js',
  'src/groups/whiteboard/utils/boardStore.js',
  'src/router/index.js',
  'src/views/GisApp.vue',
  'electron-main.cjs'
]);

const YELLOW = new Set([
  'src/groups/geo/utils/toolRegistry.js',
  '.agents/PROJECT_MEMO.md',
  '.agents/references/red-lines.md',
  'public/ai-import/manifest.json'
]);

let staged = '';
try {
  staged = execSync('git diff --cached --name-only', { encoding: 'utf8' });
} catch (e) {
  process.exit(0);
}

const files = staged.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
const hitRed = files.filter(f => RED_LINES.has(f));
const hitYellow = files.filter(f => YELLOW.has(f));

if (hitRed.length === 0 && hitYellow.length === 0) process.exit(0);

console.log('');
console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║  ⚠️  本次提交触及了红线 / 谨慎清单                      ║');
console.log('╚══════════════════════════════════════════════════════════╝');
if (hitRed.length) {
  console.log('');
  console.log('🔴 绝对禁止类（请确认改动必要性）：');
  hitRed.forEach(f => console.log('    ' + f));
}
if (hitYellow.length) {
  console.log('');
  console.log('🟡 谨慎改动类（请确认改意向用户说明）：');
  hitYellow.forEach(f => console.log('    ' + f));
}
console.log('');
console.log('提示：如需查看具体改动 → git diff --cached -- <file>');
console.log('如需查看红线清单 → cat .agents/references/red-lines.md');
console.log('');

// 不阻塞，退出码 0（仅警告）
process.exit(0);
