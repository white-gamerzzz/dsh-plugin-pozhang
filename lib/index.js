/**
 * @white-gamerzzz/dsh-plugin-pozhang — 聚合再导出壳
 *
 * 本包是破障子系统的承载：pozhang/*（注入/拦截/出站口/中继）与 settings（设置页 Service）。
 * 生命周期仍由宿主（dsh-plugin-code-studio）的 apply 驱动，本包不写 apply()、不抢端口。
 *
 * 宿主按名从包根取符号（PZ.installInterceptor / PZ.ensureRouted / PZ.startRelay ...），
 * 因此这里必须把四条来源全部聚合再导出——少导一条，宿主取到 undefined 就静默降级，
 * 装上破障也等于没装（四模块导出名无冲突，export * 安全）。
 */
export * from '../pozhang/index.js';          // ensureInjected / status / uninstall / agentPrefix / agentAnchor / startGuard ...
export * from '../pozhang/intercept.js';      // installInterceptor / interceptStatus / uninstallInterceptor ...
export * from '../pozhang/autoroute.js';      // ensureRouted / restoreRouted / routeStatus ...
export * from '../pozhang/relay-control.js';  // startRelay / stopRelay / relayStatus / setChain / saveRelayConfig / autoStartRelay ...
export { PozhangSettings } from './pozhang-settings.js';