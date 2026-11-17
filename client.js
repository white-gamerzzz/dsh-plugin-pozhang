window.__ModuleLoader__.load({
  id: '@whitegamerzzz/dsh-plugin-pozhang',
  factory(require) {
    const React = require('react');
    const h = React.createElement;

    // 破障面板：从 dsh-plugin-code-studio 的 client.js 拆出，独立成一个设置页导航项。
    // 不再与 agent-models 面板共页，因此这里自带它需要的排版基线（PZ_THEME/panelBox/...）。
    const PZ_NS = 'pozhang';
    const PZ_SETTINGS_NS = 'code-studio-pozhang'; // 与 cordis.patch.yml 的 settings 条目 id 对齐（服务名 pozhangSettings）

    const inject = ['locale', 'configForms', 'slots'];

    function makeT(locale, dictionaries, ns = PZ_NS) {
      const bound = typeof locale?.bind === 'function' ? locale.bind(ns) : undefined;
      if (typeof bound === 'function') {
        return (key) => {
          const text = bound(key);
          return typeof text === 'string' && text.length > 0 && text !== key ? text : (dictionaries[key] ?? key);
        };
      }
      return (key) => dictionaries[key] ?? key;
    }

    function resolveLocale(locale) {
      let value;
      if (typeof locale?.getLocale === 'function') value = locale.getLocale();
      else if (typeof locale?.getSnapshot === 'function') value = locale.getSnapshot();
      else if (typeof locale?.current === 'function') value = locale.current();
      else value = locale?.current;
      const id = typeof value === 'string' ? value : value?.active ?? value?.id ?? value?.locale;
      return typeof id === 'string' && id.toLowerCase().startsWith('en') ? 'en' : 'zh';
    }

    // ---------------------------------------------------------------- 破障设置页文案
    const zhPz = {
      nav: '破障',
      title: '破障 · 拦截转发中继',
      description:
        '中继检查每个出站请求：破障正文与角色锚点齐全就原样放行，缺失就补到 system 层再转发。'
        + '补在 system 层，后续任何上下文压缩都折叠不到它。一个进程、一个端口，所有会话共享。',
      enabled: '允许经本机中继转发',
      enabledHint: '监控服务始终随插件启动；这个开关只决定是否值得把 provider 的 Base URL 指到本机中继。',
      port: '监听端口',
      upstream: '上游地址',
      upstreamLabel: '转发目标',
      autoTag: '自动',
      interceptLabel: '进程内拦截（推荐）',
      interceptHint: '直接接管 dsh 的出站请求，按请求地址自动认出 provider，不需要改任何 Base URL。',
      interceptOn: '已挂载',
      interceptOuter: '已挂载（最外层）',
      interceptInner: '被其它插件包住，5 秒内自愈',
      dispatcherOn: '传输层已挂载',
      dispatcherOff: '传输层未挂载',
      autoPending: '跟随当前 provider',
      upstreamHint:
        '按请求路径里的 provider 前缀自动选上游（/qg/v1/... → qg 的地址），多个提供商各走各的。'
        + 'dsh 里 Base URL 填 http://127.0.0.1:<端口>/<provider>。',
      save: '保存',
      saving: '保存中…',
      saved: '已保存，约 5 秒内应用到中继进程。',
      discard: '放弃修改',
      saveFailed: '保存失败，请重试。',
      conflict: '设置已在其它位置更新，请放弃修改后重试。',
      readOnly: '当前部署以只读方式保存设置。',
      unavailable: '破障设置条目未加载。',
      status: '状态',
      monitor: '监控服务',
      running: '运行中',
      stopped: '未运行',
      activeSessions: '活跃会话',
      patched: '补丁次数',
      passed: '原样放行',
      uptime: '运行时长',
      sessions: '会话',
      lastSeen: '最后活动',
      requests: '请求',
      panel: '打开监控面板',
      baseUrl: 'Base URL 指向',
      noSessions: '暂无会话',
      refresh: '刷新',
    };
    const enPz = {
      nav: 'Pozhang',
      title: 'Pozhang · Forwarding relay',
      description:
        'The relay inspects every outbound request: pass through when the prompt and role anchor are present, '
        + 'otherwise inject them into the system layer. Compression never folds the system layer. One process, one port, shared by all sessions.',
      enabled: 'Allow forwarding through local relay',
      enabledHint: 'The monitor service always starts with the plugin; this only marks whether pointing provider Base URLs here is worth it.',
      port: 'Listen port',
      upstream: 'Upstream',
      upstreamLabel: 'Forward to',
      autoTag: 'auto',
      interceptLabel: 'In-process interception',
      interceptHint: 'Takes over outbound requests in-process and identifies the provider from the URL. No Base URL changes needed.',
      interceptOn: 'mounted',
      interceptOuter: 'mounted (outermost)',
      interceptInner: 'wrapped by another plugin, self-healing within 5s',
      dispatcherOn: 'transport hooked',
      dispatcherOff: 'transport not hooked',
      autoPending: 'follows current provider',
      upstreamHint: 'Routes by the provider prefix in the path (/qg/v1/... → qg). Set dsh Base URL to http://127.0.0.1:<port>/<provider>.',
      save: 'Save',
      saving: 'Saving…',
      saved: 'Saved. Applied to the relay within ~5s.',
      discard: 'Discard',
      saveFailed: 'Save failed.',
      conflict: 'Settings changed elsewhere. Discard and retry.',
      readOnly: 'This deployment stores settings read-only.',
      unavailable: 'Pozhang settings entry is not loaded.',
      status: 'Status',
      monitor: 'Monitor',
      running: 'Running',
      stopped: 'Stopped',
      activeSessions: 'Active sessions',
      patched: 'Patched',
      passed: 'Passed through',
      uptime: 'Uptime',
      sessions: 'Session',
      lastSeen: 'Last seen',
      requests: 'Requests',
      panel: 'Open panel',
      baseUrl: 'Point Base URL to',
      noSessions: 'No sessions yet',
      refresh: 'Refresh',
    };

    class PozhangController {
      constructor(scope) {
        this.scope = scope;
        this.listeners = new Set();
        this.draft = { enabled: false, port: 8788, intercept: true };
        this.baseRevision = undefined;
        this.dirty = false;
        this.saving = false;
        this.failed = false;
        this.conflicted = false;
        this.justSaved = false;
        const snap = scope.getSnapshot();
        if (snap?.status === 'ready') this.adopt(snap);
        this.unsubscribe = scope.subscribe(() => {
          const next = scope.getSnapshot();
          if (next?.status !== 'ready') {
            this.emit();
            return;
          }
          if (this.dirty && next.revision !== this.baseRevision) this.conflicted = true;
          if (!this.dirty) this.adopt(next);
          this.emit();
        });
      }

      adopt(snap) {
        const v = snap.value ?? {};
        this.draft = {
          enabled: v.relayEnabled === true,
          port: Number(v.relayPort || 8788),
          intercept: v.interceptEnabled !== false,
        };
        this.baseRevision = snap.revision;
        this.dirty = false;
        this.conflicted = false;
        this.justSaved = false;
      }

      subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
      }

      emit() {
        for (const listener of [...this.listeners]) listener();
      }

      snapshot() {
        const host = this.scope.getSnapshot();
        return {
          status: host?.status ?? 'unavailable',
          writable: host?.status === 'ready' && host.writable === true,
          draft: this.draft,
          dirty: this.dirty,
          saving: this.saving,
          failed: this.failed,
          conflicted: this.conflicted,
          justSaved: this.justSaved,
        };
      }

      update(patch) {
        this.draft = { ...this.draft, ...patch };
        this.dirty = true;
        this.justSaved = false;
        this.emit();
      }

      async save() {
        const host = this.scope.getSnapshot();
        if (host?.status !== 'ready' || host.writable !== true || this.saving) return;
        if (host.revision !== this.baseRevision) {
          this.conflicted = true;
          this.emit();
          return;
        }
        this.saving = true;
        this.failed = false;
        this.emit();
        try {
          const resp = await this.scope.mutate([
            { op: 'set', path: ['interceptEnabled'], value: this.draft.intercept !== false },
            { op: 'set', path: ['relayEnabled'], value: this.draft.enabled === true },
            { op: 'set', path: ['relayPort'], value: Number(this.draft.port) || 8788 },
          ], this.baseRevision);
          if (resp === false) this.failed = true;
          else {
            const after = this.scope.getSnapshot();
            if (after?.status === 'ready') this.adopt(after);
            this.justSaved = true;
          }
        } catch {
          this.failed = true;
        }
        this.saving = false;
        this.emit();
      }

      dispose() {
        this.unsubscribe?.();
      }
    }

    // ---- 破障面板排版基线（本包自带，不再依赖 code-studio）
    const PAGE_BUILD = '2026-11-18.1';

    const PZ_THEME = {
      fg: 'var(--dsh-text-1, #e6f1ec)',
      muted: 'var(--dsh-text-3, #93a8a0)',
      faint: 'var(--dsh-text-4, #6b8079)',
      line: 'var(--dsh-border-strong, #2c4139)',
      lineSoft: 'var(--dsh-border, #1f2f29)',
      panel: 'var(--dsh-surface-2, #101917)',
      accent: 'var(--dsh-accent, #34d399)',
      mono: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    };

    const panelBox = {
      border: '1px solid ' + PZ_THEME.line,
      borderRadius: 10,
      background: PZ_THEME.panel,
      padding: '18px 20px',
    };

    const inputBox = {
      width: '100%',
      boxSizing: 'border-box',
      padding: '8px 10px',
      borderRadius: 6,
      border: '1px solid ' + PZ_THEME.line,
      background: 'var(--dsh-surface-1, #0c1412)',
      color: PZ_THEME.fg,
      fontSize: 13,
      fontFamily: PZ_THEME.mono,
      outline: 'none',
    };

    const blockHead = (title, desc, t, showBuild) => h('div', { style: { display: 'grid', gap: 6, marginBottom: 16 } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 10 } },
        h('span', {
          style: {
            width: 3,
            height: 15,
            borderRadius: 2,
            background: PZ_THEME.accent,
            display: 'inline-block',
          },
        }),
        h('h3', { style: { margin: 0, fontSize: 15, fontWeight: 650, letterSpacing: '0.01em', color: PZ_THEME.fg } }, title),
        showBuild ? h('span', { style: { marginLeft: 8, fontSize: 10, color: PZ_THEME.faint, fontFamily: PZ_THEME.mono } }, 'build ' + PAGE_BUILD) : null,
      ),
      h('p', { style: { margin: 0, fontSize: 12.5, lineHeight: 1.75, color: PZ_THEME.muted, maxWidth: 680 } }, desc),
    );

    const formRow = (label, control, hint) => h('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: '104px minmax(0, 1fr)',
        gap: '8px 18px',
        alignItems: 'start',
        padding: '10px 0',
        borderTop: '1px solid ' + PZ_THEME.lineSoft,
      },
    },
      h('span', { style: { fontSize: 12.5, color: PZ_THEME.muted, paddingTop: 8 } }, label),
      h('div', { style: { display: 'grid', gap: 6, minWidth: 0 } },
        control,
        hint ? h('span', { style: { fontSize: 11.5, lineHeight: 1.65, color: PZ_THEME.faint } }, hint) : null,
      ),
    );

    const saveBtn = (tP, disabled, saving, dirty, onClick, label, extra) => h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, paddingTop: 14, borderTop: '1px solid ' + PZ_THEME.lineSoft } },
      h('button', {
        type: 'button',
        disabled: disabled || saving || !dirty,
        onClick,
        style: {
          padding: '8px 20px',
          borderRadius: 6,
          border: '1px solid ' + (dirty ? PZ_THEME.accent : PZ_THEME.line),
          background: dirty ? PZ_THEME.accent : 'transparent',
          color: dirty ? '#04120d' : PZ_THEME.faint,
          fontSize: 13,
          fontWeight: 650,
          cursor: dirty && !saving ? 'pointer' : 'default',
          transition: 'background 120ms ease-out, border-color 120ms ease-out',
        },
      }, saving ? tP('saving') : label),
      extra || null,
    );

    function PozhangPanel({ pz, locale }) {
      const tP = makeT(locale, zhPz, PZ_NS);
      const [, bump] = React.useState(0);
      React.useEffect(() => {
        let alive = true;
        const off = pz.subscribe(() => { if (alive) bump((n) => n + 1); });
        return () => { alive = false; off(); };
      }, [pz]);
      const pState = pz.snapshot();

      const [health, setHealth] = React.useState(null);
      React.useEffect(() => {
        let alive = true;
        let timer;
        const tick = async () => {
          try {
            const res = await fetch(`http://127.0.0.1:${pz.snapshot().draft.port}/_pozhang/health`, { cache: 'no-store' });
            if (!res.ok) throw new Error('bad');
            const data = await res.json();
            if (alive) setHealth(data);
          } catch {
            if (alive) setHealth(null);
          }
          if (alive) timer = setTimeout(tick, 3000);
        };
        void tick();
        return () => { alive = false; clearTimeout(timer); };
      }, [pz]);

      const pzReady = pState.status === 'ready';
      const base = `http://127.0.0.1:${pState.draft.port}`;
      const fmt = (ms) => (ms < 60000 ? `${Math.round(ms / 1000)}s` : ms < 3600000 ? `${Math.round(ms / 60000)}m` : `${Math.round(ms / 3600000)}h`);
      const sessions = (health?.sessions ?? []).slice(0, 10);

      return h('div', { style: { display: 'grid', gap: 18 } },
        h('section', { style: panelBox },
          blockHead(tP('title'), tP('description'), tP, true),

          h('div', {
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              border: '1px solid ' + PZ_THEME.line,
              borderRadius: 8,
              overflow: 'hidden',
              marginBottom: 6,
            },
          },
            [
              [tP('monitor'), health ? tP('running') : tP('stopped'), base],
              [tP('activeSessions'), String(health?.activeSessions ?? 0), null],
              [tP('patched'), String(health?.stats?.patched ?? 0), null],
              [tP('uptime'), health ? fmt(health.uptimeMs) : '—', health ? `${health.stats?.pass ?? 0} ${tP('passed')}` : null],
            ].map(([label, value, hint], i) => h('div', {
              key: label,
              style: {
                padding: '12px 14px',
                borderLeft: i === 0 ? 'none' : '1px solid ' + PZ_THEME.line,
                display: 'grid',
                gap: 3,
                minWidth: 0,
              },
            },
              h('span', { style: { fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: PZ_THEME.faint } }, label),
              h('span', {
                style: {
                  fontSize: 17,
                  fontWeight: 650,
                  fontVariantNumeric: 'tabular-nums',
                  color: health ? PZ_THEME.fg : PZ_THEME.muted,
                  lineHeight: 1.3,
                },
              }, value),
              hint ? h('span', { style: { fontSize: 11, color: PZ_THEME.faint, fontFamily: PZ_THEME.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, hint) : null,
            )),
          ),

          h('div', { style: { marginTop: 12 } },
            formRow(tP('enabled'), h('input', {
              type: 'checkbox',
              checked: pState.draft.enabled === true,
              disabled: !pzReady || !pState.writable,
              onChange: (e) => pz.update({ enabled: e.target.checked }),
              style: { justifySelf: 'start', width: 17, height: 17, accentColor: PZ_THEME.accent, marginTop: 8 },
            }), tP('enabledHint')),
            formRow(tP('interceptLabel'), h('input', {
              type: 'checkbox',
              checked: pState.draft.intercept !== false,
              disabled: !pzReady || !pState.writable,
              onChange: (e) => pz.update({ intercept: e.target.checked }),
              style: { justifySelf: 'start', width: 17, height: 17, accentColor: PZ_THEME.accent, marginTop: 8 },
            }), health?.intercept
              ? [
                health.intercept.outermost ? tP('interceptOuter') : tP('interceptInner'),
                health.intercept.dispatcher?.installed ? tP('dispatcherOn') : tP('dispatcherOff'),
                `已处理 ${(health.intercept.seen ?? 0) + (health.intercept.dispatcher?.seamless ?? 0)} 次`,
                `补丁 ${(health.intercept.patched ?? 0) + (health.intercept.dispatcher?.patched ?? 0)} 次`,
                `放行 ${(health.intercept.passed ?? 0) + (health.intercept.dispatcher?.passed ?? 0)} 次`,
                health.intercept.reasserts ? `自愈 ${health.intercept.reasserts} 次` : '',
              ].filter(Boolean).join(' · ')
              : tP('interceptHint')),
            formRow(tP('port'), h('input', {
              type: 'number',
              value: pState.draft.port,
              disabled: !pzReady || !pState.writable,
              onChange: (e) => pz.update({ port: Number(e.target.value) }),
              style: inputBox,
            })),
            formRow(tP('upstreamLabel'),
              h('div', { style: { border: '1px solid ' + PZ_THEME.line, borderRadius: 6, overflow: 'hidden' } },
                (health?.routes ?? []).length === 0
                  ? h('div', { style: { padding: '9px 12px', fontSize: 12.5, color: PZ_THEME.faint } }, tP('autoPending'))
                  : (health.routes).map((r, i) => h('div', {
                    key: r.id,
                    style: {
                      display: 'grid',
                      gridTemplateColumns: '120px minmax(0, 1fr)',
                      gap: 12,
                      alignItems: 'center',
                      padding: '8px 12px',
                      borderTop: i === 0 ? 'none' : '1px solid ' + PZ_THEME.lineSoft,
                      background: 'var(--dsh-surface-1, #0c1412)',
                    },
                  },
                    h('span', { style: { fontSize: 12, color: PZ_THEME.accent, fontFamily: PZ_THEME.mono } }, r.id),
                    h('span', { style: { fontSize: 12, color: PZ_THEME.muted, fontFamily: PZ_THEME.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.baseURL),
                  )),
              ), tP('upstreamHint')),
          ),

          saveBtn(tP, !pzReady || !pState.writable, pState.saving, pState.dirty, () => void pz.save(), tP('save'),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' } },
              pState.dirty ? h('button', {
                type: 'button',
                onClick: () => {
                  const snap = pz.scope.getSnapshot();
                  if (snap?.status === 'ready') {
                    pz.adopt(snap);
                    pz.emit();
                  }
                },
                style: { padding: '8px 14px', borderRadius: 6, border: '1px solid ' + PZ_THEME.line, background: 'transparent', color: PZ_THEME.muted, fontSize: 13, cursor: 'pointer' },
              }, tP('discard')) : null,
              pState.justSaved ? h('span', { style: { fontSize: 12, color: PZ_THEME.accent } }, tP('saved')) : null,
              pState.failed ? h('span', { style: { fontSize: 12, color: '#f87171' } }, tP('saveFailed')) : null,
              pState.conflicted ? h('span', { style: { fontSize: 12, color: '#fbbf24' } }, tP('conflict')) : null,
            ),
          ),

          h('div', { style: { display: 'grid', gap: 8, marginTop: 16 } },
            h('div', { style: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' } },
              h('span', { style: { fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: PZ_THEME.faint } }, tP('sessions')),
              h('a', { href: `${base}/_pozhang/panel`, target: '_blank', rel: 'noreferrer', style: { fontSize: 12, color: PZ_THEME.accent, textDecoration: 'none' } }, tP('panel') + ' ↗'),
            ),
            h('div', { style: { border: '1px solid ' + PZ_THEME.line, borderRadius: 8, overflow: 'hidden' } },
              h('table', { style: { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' } },
                h('thead', null, h('tr', { style: { background: 'var(--dsh-surface-3, #16211d)' } },
                  h('th', { style: { textAlign: 'left', padding: '8px 12px', fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: PZ_THEME.faint, fontWeight: 500 } }, tP('sessions')),
                  h('th', { style: { textAlign: 'right', padding: '8px 12px', fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: PZ_THEME.faint, fontWeight: 500 } }, tP('requests')),
                  h('th', { style: { textAlign: 'right', padding: '8px 12px', fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: PZ_THEME.faint, fontWeight: 500 } }, tP('patched')),
                  h('th', { style: { textAlign: 'right', padding: '8px 12px', fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: PZ_THEME.faint, fontWeight: 500 } }, tP('lastSeen')),
                )),
                h('tbody', null, sessions.length === 0
                  ? h('tr', null, h('td', { colSpan: 4, style: { padding: '14px 12px', fontSize: 12.5, color: PZ_THEME.faint } }, tP('noSessions')))
                  : sessions.map((row, i) => h('tr', { key: row.key, style: { borderTop: i === 0 ? 'none' : '1px solid ' + PZ_THEME.lineSoft } },
                    h('td', { style: { padding: '9px 12px', fontSize: 12.5, color: PZ_THEME.muted, fontFamily: PZ_THEME.mono, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, String(row.key).slice(0, 30)),
                    h('td', { style: { padding: '9px 12px', fontSize: 12.5, color: PZ_THEME.fg, textAlign: 'right', fontVariantNumeric: 'tabular-nums' } }, String(row.requests)),
                    h('td', { style: { padding: '9px 12px', fontSize: 12.5, color: PZ_THEME.fg, textAlign: 'right', fontVariantNumeric: 'tabular-nums' } }, String(row.patched)),
                    h('td', { style: { padding: '9px 12px', fontSize: 12.5, color: PZ_THEME.muted, textAlign: 'right', fontFamily: PZ_THEME.mono } }, fmt(Date.now() - row.lastSeen)),
                  )),
                ),
              ),
            ),
          ),
        ),
      );
    }

    function apply(ctx) {
      const locale = ctx.locale;

      ctx.effect(() => {
        if (locale === undefined || typeof locale.register !== 'function') return () => undefined;
        const disposer = locale.register(PZ_NS, { zh: zhPz, en: enPz });
        return typeof disposer === 'function' ? disposer : () => undefined;
      }, `${PZ_NS}: dictionaries`);

      const pzController = new PozhangController(ctx.configForms.get(PZ_SETTINGS_NS));
      ctx.effect(() => () => pzController.dispose(), `${PZ_NS}: form`);

      const tP = () => makeT(locale, zhPz, PZ_NS);

      ctx.effect(() => ctx.configForms.whileServed([PZ_SETTINGS_NS], () => {
        // 只在表单就绪且真正注册时占位：插件若被挂载两次，第二份让位；卸载时释放。
        if (typeof window !== 'undefined' && window.__pozhangPageOwned) return () => undefined;
        if (typeof window !== 'undefined') window.__pozhangPageOwned = true;

        const off = ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section',
          id: PZ_SETTINGS_NS,
          order: 60,
          label: () => tP()('nav'),
          locale: PZ_NS,
        }, (props) => h(PozhangPanel, {
          ...props,
          pz: pzController,
          locale: resolveLocale(locale),
        })));

        return () => {
          if (typeof window !== 'undefined') window.__pozhangPageOwned = false;
          off?.();
        };
      }), `${PZ_NS}: page`);
    }

    const exported = {
      inject,
      apply,
      __ns: { PZ_NS, PZ_SETTINGS_NS, PozhangController, PozhangPanel },
    };
    return exported;
  },
});
