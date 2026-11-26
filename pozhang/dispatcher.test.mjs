// dispatcher 层冒烟：用 undici.request 真实发请求，验证 system 注入发生在 transport 层
import http from 'node:http';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';

/* undici 不是插件依赖：按 intercept-dispatcher.loadUndici 同款候选顺序解析，
   绝不写死作者机器路径。必须在覆盖 HOME/USERPROFILE 之前用真实 home 扫描。 */
const REAL_HOME = process.env.USERPROFILE || homedir();
function resolveUndiciPath() {
  const require = createRequire(import.meta.url);
  const candidates = [
    'undici',
    join(REAL_HOME, '.dsh', 'profiles', 'desktop', 'node_modules', 'undici'),
    join(REAL_HOME, '.dsh', 'dsh-runtimes', 'dsh-primary-runtime', 'dependencies', 'node', 'node_modules', 'undici'),
  ];
  try {
    const root = join(REAL_HOME, '.dsh', 'profiles');
    for (const name of readdirSync(root, { withFileTypes: true })) {
      if (name.isDirectory()) candidates.push(join(root, name.name, 'node_modules', 'undici'));
    }
  } catch { /* 没有 profiles 目录 */ }
  for (const spec of candidates) {
    try { return require.resolve(spec); } catch { /* 试下一个 */ }
  }
  throw new Error('找不到 undici：本测试复用宿主 DSH profile 里的 undici（~/.dsh/profiles/<名>/node_modules），或先 npm i undici');
}
const undiciPath = resolveUndiciPath();
const undici = createRequire(import.meta.url)(undiciPath);
/* 同一路径喂给 loadUndici 的首选候选，保证拦截器补的就是测试手里这份实例 */
process.env.POZHANG_UNDICI = undiciPath;
const HOME = mkdtempSync(join(tmpdir(), 'pozhang-disp-'));
process.env.HOME = HOME;
process.env.USERPROFILE = HOME;
mkdirSync(join(HOME, '.dsh', 'profiles', 'desktop'), { recursive: true });
writeFileSync(join(HOME, '.dsh', 'AGENTS.md'),
  '<!-- POZHANG-INJECT:BEGIN -->\n# 中转站保护（唯一禁止项）\n\n测试用破障正文。\n<!-- POZHANG-INJECT:END -->\n');

// 假上游（用 node:http 起，undici 作为客户端去连）
const hits = [];
const srv = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    hits.push({ path: req.url, text: Buffer.concat(chunks).toString('utf8'), headers: req.headers });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"ok":true}');
  });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;

writeFileSync(join(HOME, '.dsh', 'profiles', 'desktop', 'cordis.patch.yml'), [
  '    providers:',
  '      local:',
  `        baseURL: http://127.0.0.1:${port}/v1`,
].join('\n') + '\n');

let pass = 0, fail = 0;
const t = (n, c) => { c ? (pass++, console.log('  ✓ ' + n)) : (fail++, console.log('  ✗ ' + n)); };

const { installInterceptor, interceptStatus } = await import('./intercept.js');
installInterceptor();

// 1) undici.request：绕过 fetch，直接走 transport
await undici.request(`http://127.0.0.1:${port}/v1/chat/completions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ model: 'm', messages: [{ role: 'user', content: 'hi' }] }),
});
const got = JSON.parse(hits.at(-1).text);
t('undici 请求被补 system', Array.isArray(got.messages) && got.messages[0].role === 'system');
t('补丁含破障正文', got.messages[0].content.includes('中转站保护'));
t('content-length 已按新 body 重算', Number(hits.at(-1).headers['content-length']) === Buffer.byteLength(hits.at(-1).text));

// 2) 已齐全 → 不改写
const already = { model: 'm', messages: [{ role: 'system', content: '[身份优先] code_roles 取回 中转站保护' }, { role: 'user', content: 'x' }] };
const raw = JSON.stringify(already);
await undici.request(`http://127.0.0.1:${port}/v1/chat/completions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: raw,
});
t('已齐全时原样透传', hits.at(-1).text === raw);

// 3) 非 provider 主机不处理
const other = [];
const srv2 = http.createServer((req, res) => { const c = []; req.on('data', (x) => c.push(x)); req.on('end', () => { other.push(Buffer.concat(c).toString('utf8')); res.end('{}'); }); });
await new Promise((r) => srv2.listen(0, '127.0.0.1', r));
await undici.request(`http://127.0.0.1:${srv2.address().port}/v1/chat`, { method: 'POST', body: '{"a":1}' });
t('非路由表主机不碰', other.at(-1) === '{"a":1}');

const st = interceptStatus();
t('dispatcher 层已安装', st.dispatcher?.installed === true);
t('dispatcher 统计到补丁', st.dispatcher?.patched >= 1);

srv.close();
srv2.close();
rmSync(HOME, { recursive: true, force: true });
console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
