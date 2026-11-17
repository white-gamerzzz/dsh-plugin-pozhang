/**
 * @whitegamerzzz/dsh-plugin-pozhang — 聚合再导出壳
 *
 * 本包是破障子系统的承载：pozhang/*（注入/拦截/出站口/中继）与 settings（设置页 Service）。
 * 第二阶段起本包自驱动：lib/apply.js 提供 apply()/name/inject，由本包的 cordis.bundle.patch 挂载。
 * 其余符号仍按名再导出，供 code-studio 的 /hz 命令等直接取用。
 *
 * 少导一条，取到 undefined 就静默降级，装上破障也等于没装（四模块导出名无冲突，export * 安全）。
 */
export * from '../pozhang/index.js';          // ensureInjected / status / uninstall / agentPrefix / agentAnchor / startGuard ...
export * from '../pozhang/intercept.js';      // installInterceptor / interceptStatus / uninstallInterceptor ...
export * from '../pozhang/autoroute.js';      // ensureRouted / restoreRouted / routeStatus ...
export * from '../pozhang/relay-control.js';  // startRelay / stopRelay / relayStatus / setChain / saveRelayConfig / autoStartRelay ...
export { PozhangSettings } from './pozhang-settings.js';
export { apply, name, inject } from './apply.js';  // 第二阶段：本包自驱动入口