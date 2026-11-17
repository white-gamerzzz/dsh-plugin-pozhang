# @whitegamerzzz/dsh-plugin-pozhang · 破障注入子系统

从 `dsh-plugin-code-studio` 拆出的独立插件：AGENTS.md 幂等注入、进程内出站拦截、HTTP 中继监控、技能库。可单独安装。

**自驱动**：本包自带 `lib/apply.js`（`name='pozhang'`），由 profile 的 cordis patch 直接挂载，加载即幂等注入 AGENTS.md、挂进程内拦截、启中继并接管出站口。监听一律只绑 `127.0.0.1`；端口被占显式失败，绝不偷偷换端口。

> **软依赖提示**：破障驱动已内置在本独立包；`dsh-plugin-code-studio` 只是可选消费方——只升级 code-studio 而未安装本独立包时，破障能力会静默降级，需另行安装 `@whitegamerzzz/dsh-plugin-pozhang`。

## 安装

```bash
npm i dsh-plugin-pozhang
```

在 profile 的 `cordis.patch.yml` 里插入设置页条目（本包自带的 patch 也可由宿主 bundle 合并）：

```yaml
- insert:
    - id: code-studio-pozhang
      name: '@whitegamerzzz/dsh-plugin-pozhang/settings'
    - id: code-studio-pozhang-driver
      name: '@whitegamerzzz/dsh-plugin-pozhang'
```

peerDependencies 只要求宿主已具备的三件：`@deepseek-ai/cordis`、`@deepseek-ai/dsh`、`@deepseek-ai/schemastery`。Node `>=20`。

## 使用

命令：

```bash
/hz              # 查看状态（注入是否最新、字符数、技能数）
/hz on           # 立即重新注入
/hz off          # 卸载：摘掉 AGENTS.md 注入块并清理本包装的技能
/hz relay on [端口] [上游]   # 开中继
/hz relay off               # 关中继
```

设置页里独立的**破障**导航项（服务名 `pozhangSettings`，自带面板）：`interceptEnabled` / `relayEnabled` / `relayPort`。

## 宿主缺失时的降级

本包是**可选依赖**。宿主 `dsh-plugin-code-studio` 破障缺失时不会崩：

- 可选 import 失败只走降级，`import` 仍 EXIT 0。
- 各符号降级为无害 stub：`agentPrefix`/`agentAnchor` 返 `''`、`startGuard`/`ensureInjected`/`uninstall` / 拦截 / 中继相关为 no-op 或空集。
- `/hz` 在破障未安装时直接返回「破障插件未安装」，不误报「已全部经中继」。

装上本包即恢复全部功能；缺了它则功能静默降级（不崩、不报错、只是不生效）。

## 资源

- 提示词正文：`pozhang/assets/破障v4.md`
- 技能库：`pozhang/assets/codex-skills-v4/`（63 个 skill，随包全量发布）

## 测试

```bash
npm test
```

跑 8 组 `node pozhang/*.mjs`：smoke / patch / autoroute / relay / chain / chain-fallback / intercept / dispatcher。

## License

MIT
