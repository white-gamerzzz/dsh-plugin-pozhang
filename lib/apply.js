/**
 * @whitegamerzzz/dsh-plugin-pozhang — 破障子系统驱动入口。
 *
 * 破障现在是自驱动的独立插件（第二阶段）：本包自己 apply —— 注入 AGENTS.md、
 * 挂进程内拦截、启中继并接管出站口、按设置页收敛。不再依赖 code-studio 的 apply 代劳。
 * 压缩守望仍留在 code-studio（它依赖 code-studio 的子会话登记表，不属于本包）。
 *
 * 安全：监听/拦截一律只绑 127.0.0.1；端口被占显式失败，绝不偷偷换端口。
 */

import { ensureInjected, startGuard } from '../pozhang/index.js';
import { installInterceptor, interceptStatus } from '../pozhang/intercept.js';
import { ensureRouted } from '../pozhang/autoroute.js';
import { startRelay, saveRelayConfig } from '../pozhang/relay-control.js';

export const name = 'pozhang';
export const inject = [];

export function apply(ctx) {
  const log = (line) => ctx.logger?.debug?.(`pozhang: ${line}`);

  // 启动即幂等注入 ~/.dsh/AGENTS.md（内容一致就跳过；升级后自动换新提示词）
  void ensureInjected({ log })
    .then((res) => {
      if (res?.changed) ctx.logger?.info?.('pozhang: 已写入 AGENTS.md 注入块（重启 dsh 后新会话生效）');
      else if (res && res.ok === false) ctx.logger?.warn?.(`pozhang: 注入未执行 ${res.error ?? ''}`);
    })
    .catch((error) => ctx.logger?.warn?.(`pozhang: 注入失败 ${error instanceof Error ? error.message : String(error)}`));

  // 守护：注入块被改/删自动补回
  const stopGuard = startGuard({
    onChange: () => ctx.logger?.warn?.('pozhang: 检测到 AGENTS.md 注入块被修改或删除，已补回'),
  });
  if (typeof ctx.effect === 'function') ctx.effect(() => () => stopGuard());

  // 进程内拦截（主路径，与 billion-context 同款）：不改 Base URL，按 URL 认出 provider
  const ps0 = ctx.get?.('pozhangSettings');
  const interceptOn = !ps0 || typeof ps0.readField !== 'function'
    ? true
    : ps0.readField('interceptEnabled', true) !== false;
  if (interceptOn) {
    const uninstallIntercept = installInterceptor({
      onEvent: (kind, detail) => ctx.logger?.debug?.(`pozhang: ${kind} ${JSON.stringify(detail)}`),
    });
    if (typeof ctx.effect === 'function') ctx.effect(() => () => uninstallIntercept());
    const ist = interceptStatus();
    ctx.logger?.info?.(
      ist.installed
        ? `pozhang: 进程内拦截已启用（fetch 层${ist.dispatcher?.installed ? ' + undici 传输层' : '，传输层未挂载'}）`
        : `pozhang: 进程内拦截挂载失败 ${ist.error ?? ''}`,
    );
  }

  // 设置页写的配置优先：存在时 relayEnabled 是自启动的唯一权威
  const settingsAtStart = ctx.get?.('pozhangSettings');
  if (settingsAtStart && typeof settingsAtStart.readField === 'function') {
    const want = settingsAtStart.readField('relayEnabled', false) === true;
    saveRelayConfig({
      enabled: want,
      port: Number(settingsAtStart.readField('relayPort', 8788)),
    });
  }
  // 监控服务随插件加载即启动（只监听 127.0.0.1，不接流量也能看状态）
  const relayPortAtStart = Number(settingsAtStart?.readField?.('relayPort', 8788) ?? 8788);
  void startRelay({ port: relayPortAtStart, log: (l) => ctx.logger?.info?.(l) })
    .then((r) => {
      if (r?.started || r?.already) {
        ctx.logger?.info?.(`pozhang: 监控服务就绪 http://127.0.0.1:${r.port}/_pozhang/panel`);
        // 自动接管出站口：把所有 provider 指到本机中继，确保任何请求先经破障再出站（幂等）
        try {
          const res = ensureRouted({ port: r.port });
          if (res.changed.length) {
            ctx.logger?.info?.(
              `pozhang: 已接管 ${res.changed.length} 个 provider 出站口（${res.changed.map((c) => c.id).join(', ')}）→ 重启 dsh 生效`,
            );
          } else {
            ctx.logger?.info?.(`pozhang: 出站口已全部经中继（跳过 ${res.skipped.length} 个）`);
          }
        } catch (e) {
          ctx.logger?.warn?.(`pozhang: 接管出站口失败 ${e instanceof Error ? e.message : String(e)}`);
        }
      } else if (r && r.ok === false) {
        ctx.logger?.warn?.(`pozhang: 监控服务启动失败 ${r.error ?? ''}`);
      }
    })
    .catch((e) => ctx.logger?.warn?.(`pozhang: 监控服务启动异常 ${e instanceof Error ? e.message : String(e)}`));

  // 设置页 → 进程收敛（设置页只写配置，这里按配置启停；状态只有一处来源）
  let lastRelaySig = null;
  const reconcileRelay = async () => {
    const ps = ctx.get?.('pozhangSettings');
    if (!ps || typeof ps.readField !== 'function') return;
    const want = ps.readField('relayEnabled', false) === true;
    const port = Number(ps.readField('relayPort', 8788));
    const sig = `${want}|${port}`;
    if (lastRelaySig === null) {
      lastRelaySig = sig; // 启动时交给 autoStartRelay，不在这里抢
      return;
    }
    if (sig === lastRelaySig) return;
    lastRelaySig = sig;
    try {
      // 监控服务常驻：开关只表示"允许把 Base URL 指过来"，不再启停服务
      await startRelay({ port, log: (l) => ctx.logger?.info?.(l) });
      ctx.logger?.info?.(`pozhang: 中继转发${want ? '已允许' : '已停用（监控仍在）'}，端口 ${port}`);
    } catch (e) {
      ctx.logger?.warn?.(`pozhang: 中继收敛失败 ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  const relayTimer = setInterval(() => void reconcileRelay(), 5000);
  relayTimer.unref?.();
  if (typeof ctx.effect === 'function') ctx.effect(() => () => clearInterval(relayTimer));
}
