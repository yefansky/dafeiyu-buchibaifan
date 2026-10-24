window.__ModuleLoader__.load({ id: '@piaobo_gz/dafeiyu-buchibaifan', factory: (require) => {
  const module = { exports: {} }
  const exports = module.exports
  const React = require('react')
  const { useEffect, useRef, useState } = React
  const CONFIG_ENDPOINT = '/plugins/dafeiyu-buchibaifan/config'
  const STATS_ENDPOINT = '/plugins/dafeiyu-buchibaifan/stats'
  const SOUND_PREVIEW_ENDPOINT = '/plugins/dafeiyu-buchibaifan/sound-preview'

  const cardStyle = {
    listStyle: 'none', border: '1px solid var(--border-color, #d8d8d8)', borderRadius: 12,
    padding: 16, background: 'var(--surface-color, transparent)', display: 'grid', gap: 14,
  }
  const rowStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 20 }
  const selectStyle = { minWidth: 120, padding: '6px 10px', borderRadius: 8 }
  const statGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }
  const statCellStyle = {
    border: '1px solid var(--border-color, #e3e5e9)', borderRadius: 10, padding: '10px 12px',
  }
  const statLabelStyle = { display: 'block', fontSize: 12, opacity: 0.62 }
  const statValueStyle = { display: 'block', fontSize: 19, fontWeight: 700, marginTop: 4 }
  const mutedStyle = { fontSize: 12, opacity: 0.66, lineHeight: 1.5 }
  const linkButtonStyle = {
    justifySelf: 'start', padding: '5px 12px', borderRadius: 8, cursor: 'pointer',
    border: '1px solid var(--border-color, #d8d8d8)', background: 'transparent',
  }

  function Field({ label, hint, children }) {
    return React.createElement('label', { style: rowStyle },
      React.createElement('span', null,
        React.createElement('span', { style: { display: 'block', fontWeight: 600 } }, label),
        React.createElement('small', { style: { display: 'block', opacity: 0.65, marginTop: 3 } }, hint),
      ),
      children,
    )
  }

  function StatCell({ label, value, tone }) {
    return React.createElement('div', { style: statCellStyle },
      React.createElement('span', { style: statLabelStyle }, label),
      React.createElement('strong', { style: { ...statValueStyle, color: tone } }, value),
    )
  }

  function formatTokens(total) {
    if (typeof total !== 'number' || !Number.isFinite(total)) return '--'
    if (total >= 1e8) return `${(total / 1e8).toFixed(2)} 亿`
    if (total >= 1e4) return `${(total / 1e4).toFixed(1)} 万`
    return String(Math.round(total))
  }

  function formatClock(ms) {
    if (typeof ms !== 'number' || !Number.isFinite(ms)) return '--'
    try {
      return new Date(ms).toLocaleTimeString('zh-CN', { hour12: false })
    } catch {
      return '--'
    }
  }

  function barMaxCny(cap) {
    let max = 1000
    const value = Number(cap) || 1000
    while (value > max) max *= 10
    return max
  }

  function BigFishCard() {
    const [status, setStatus] = useState('loading')
    const [value, setValue] = useState({})
    const [busy, setBusy] = useState(false)
    const [stats, setStats] = useState(null)
    const [statsError, setStatsError] = useState(false)
    const [statsBusy, setStatsBusy] = useState(false)
    const [soundBusy, setSoundBusy] = useState(false)
    const [soundStatus, setSoundStatus] = useState('')
    const patchSeq = useRef(0)
    const sliderTimers = useRef(new Map())
    const writable = status === 'ready' && !busy

    const loadStats = async () => {
      setStatsBusy(true)
      try {
        const response = await fetch(STATS_ENDPOINT, { cache: 'no-store' })
        if (!response.ok) throw new Error(`stats request failed: ${response.status}`)
        const next = await response.json()
        setStats(next)
        setStatsError(false)
      } catch {
        setStatsError(true)
      } finally {
        setStatsBusy(false)
      }
    }

    useEffect(() => {
      let active = true
      fetch(CONFIG_ENDPOINT, { cache: 'no-store' })
        .then(async (response) => {
          if (!response.ok) throw new Error(`settings request failed: ${response.status}`)
          return response.json()
        })
        .then((next) => { if (active) { setValue(next); setStatus('ready') } })
        .catch(() => { if (active) setStatus('unavailable') })
      void loadStats()
      const timer = setInterval(() => { if (active) void loadStats() }, 60_000)
      return () => {
        active = false
        clearInterval(timer)
        for (const handle of sliderTimers.current.values()) clearTimeout(handle)
        sliderTimers.current.clear()
      }
    }, [])

    const write = async (field, next) => {
      const seq = ++patchSeq.current
      setBusy(true)
      try {
        const response = await fetch(CONFIG_ENDPOINT, {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ [field]: next }),
        })
        if (!response.ok) throw new Error(`settings write failed: ${response.status}`)
        const updated = await response.json()
        if (seq === patchSeq.current) {
          setValue(updated)
          setStatus('ready')
        }
      } catch {
        if (seq === patchSeq.current) setStatus('unavailable')
      } finally {
        if (seq === patchSeq.current) setBusy(false)
      }
    }

    const writeSlider = (field, next) => {
      // Keep the slider responsive while dragging: update the local value
      // immediately and send a single debounced PATCH once the user pauses.
      setValue((prev) => ({ ...prev, [field]: next }))
      // Invalidate an in-flight write so a stale response cannot revert the
      // optimistic slider value while the user keeps dragging.
      patchSeq.current += 1
      const pending = sliderTimers.current.get(field)
      if (pending) clearTimeout(pending)
      const timer = setTimeout(() => {
        sliderTimers.current.delete(field)
        void write(field, next)
      }, 250)
      sliderTimers.current.set(field, timer)
    }

    const previewSound = async () => {
      // Preview is an explicit user gesture and works even while the sound
      // toggle is off. The helper synthesises/plays it, so no browser
      // autoplay unlock is involved.
      setSoundBusy(true)
      try {
        const response = await fetch(SOUND_PREVIEW_ENDPOINT, { method: 'POST' })
        if (!response.ok) throw new Error(`sound preview failed: ${response.status}`)
        setSoundStatus('已发送试听：听到叮咚即代表本机音频可用。')
      } catch {
        setSoundStatus('试听失败：桌宠 helper 尚未就绪。')
      } finally {
        setSoundBusy(false)
      }
    }

    const statsTone = statsError ? 'var(--text-color, inherit)' : undefined
    const balanceTone = (() => {
      const balance = stats?.balanceCny
      const cap = stats?.balanceCapCny
      if (typeof balance !== 'number' || typeof cap !== 'number' || cap <= 0) return undefined
      const ratio = balance / cap
      if (ratio <= 0.2) return '#E5484D'
      if (ratio <= 0.45) return '#D88A00'
      return '#1E9E5A'
    })()

    return React.createElement('li', { style: cardStyle, 'data-testid': 'dafeiyu-buchibaifan-settings' },
      React.createElement('div', null,
        React.createElement('strong', { style: { fontSize: 16 } }, '大肥鱼桌面伴侣'),
        React.createElement('p', { style: { margin: '5px 0 0', opacity: 0.72 } }, '入口和状态属于 DSH，鱼始终显示在 Windows 桌面最上层。'),
      ),
      React.createElement('div', { style: { display: 'grid', gap: 10 } },
        React.createElement('div', { style: statGridStyle },
          React.createElement(StatCell, { label: '今日消耗', value: stats?.todayLabel ?? '--', tone: statsTone }),
          React.createElement(StatCell, { label: '本月消耗', value: stats?.monthLabel ?? '--', tone: statsTone }),
          React.createElement(StatCell, { label: '账户余额', value: stats?.balanceLabel ?? '--', tone: balanceTone }),
        ),
        React.createElement('span', { style: mutedStyle },
          `今日 ${formatTokens(stats?.todayTotal)} tokens（输入 ${formatTokens(stats?.todayTokens?.uncachedInputTokens)} · 缓存命中 ${formatTokens(stats?.todayTokens?.cacheReadTokens)} · 输出 ${formatTokens(stats?.todayTokens?.outputTokens)}）`,
        ),
        React.createElement('span', { style: mutedStyle },
          `本月 ${formatTokens(stats?.monthTotal)} tokens · 余额基准 ¥${stats?.balanceCapCny ?? 1000} · 进度条上限 ¥${stats?.balanceBarMaxCny ?? 1000} · 更新于 ${formatClock(stats?.updatedAt)}`,
        ),
        React.createElement('span', { style: mutedStyle },
          '花费按 DeepSeek 官方人民币单价估算（高峰 / 空闲半价，按每条用量发生时判定）；余额为账户实际值。',
        ),
        React.createElement('button', {
          type: 'button', style: linkButtonStyle, disabled: statsBusy,
          onClick: () => void loadStats(),
        }, statsBusy ? '刷新中…' : statsError ? '重试统计' : '刷新统计'),
      ),
      status === 'unavailable'
        ? React.createElement('span', { role: 'status' }, '大肥鱼设置尚未连接到 DSH Host。')
        : status === 'loading'
        ? React.createElement('span', null, '正在读取设置…')
        : React.createElement(React.Fragment, null,
          React.createElement(Field, { label: '启用大肥鱼', hint: '关闭后立即退出；重新开启无需单独启动程序。' },
            React.createElement('input', {
              type: 'checkbox', checked: value.enabled !== false, disabled: !writable,
              onChange: (event) => void write('enabled', event.target.checked),
            }),
          ),
          React.createElement(Field, { label: '桌宠下方显示费用条', hint: '今日 / 本月 / 余额三个数字，余额带进度条。' },
            React.createElement('input', {
              type: 'checkbox', checked: value.showStats !== false, disabled: !writable,
              onChange: (event) => void write('showStats', event.target.checked),
            }),
          ),
          React.createElement(Field, { label: '余额进度条基准', hint: `¥${Math.round(value.balanceCapCny ?? 1000)} → 进度条按 ¥${barMaxCny(value.balanceCapCny ?? 1000)} 显示` },
            React.createElement('input', {
              type: 'range', min: 100, max: 20000, step: 100, value: value.balanceCapCny ?? 1000,
              disabled: status !== 'ready',
              onChange: (event) => void writeSlider('balanceCapCny', Number(event.target.value)),
            }),
          ),
          React.createElement(Field, { label: '动作切换间隔', hint: `${Math.round(value.actionCooldownMs ?? 800)} 毫秒（两次切换的最小间隔）` },
            React.createElement('input', {
              type: 'range', min: 200, max: 4000, step: 50, value: value.actionCooldownMs ?? 800,
              disabled: status !== 'ready',
              onChange: (event) => void writeSlider('actionCooldownMs', Number(event.target.value)),
            }),
          ),
          React.createElement(Field, { label: '动作停留时长', hint: `${Math.round(value.actionDwellMs ?? 1500)} 毫秒（每个动作至少停留）` },
            React.createElement('input', {
              type: 'range', min: 400, max: 6000, step: 100, value: value.actionDwellMs ?? 1500,
              disabled: status !== 'ready',
              onChange: (event) => void writeSlider('actionDwellMs', Number(event.target.value)),
            }),
          ),
          React.createElement(Field, { label: '角色大小', hint: `${Math.round((value.scale ?? 1) * 100)}%` },
            React.createElement('input', {
              type: 'range', min: 0.7, max: 1.4, step: 0.05, value: value.scale ?? 1,
              disabled: status !== 'ready',
              onChange: (event) => void writeSlider('scale', Number(event.target.value)),
            }),
          ),
          React.createElement(Field, { label: '气泡大小', hint: `${Math.round((value.bubbleScale ?? 1) * 100)}%` },
            React.createElement('input', {
              type: 'range', min: 0.8, max: 1.2, step: 0.05, value: value.bubbleScale ?? 1,
              disabled: status !== 'ready',
              onChange: (event) => void writeSlider('bubbleScale', Number(event.target.value)),
            }),
          ),
          React.createElement(Field, { label: '活跃程度', hint: '控制空闲时微动作的出现频率。' },
            React.createElement('select', {
              value: value.activityLevel ?? 'normal', disabled: !writable, style: selectStyle,
              onChange: (event) => void write('activityLevel', event.target.value),
            },
            React.createElement('option', { value: 'quiet' }, '安静'),
            React.createElement('option', { value: 'normal' }, '标准'),
            React.createElement('option', { value: 'lively' }, '活泼')),
          ),
          React.createElement(Field, { label: '减少动态效果', hint: '减少走动、循环帧和程序化晃动。' },
            React.createElement('input', {
              type: 'checkbox', checked: value.reducedMotion === true, disabled: !writable,
              onChange: (event) => void write('reducedMotion', event.target.checked),
            }),
          ),
          React.createElement(Field, { label: '响应子 Agent', hint: '默认只跟随顶层任务，避免状态过度跳动。' },
            React.createElement('input', {
              type: 'checkbox', checked: value.includeSubagents === true, disabled: !writable,
              onChange: (event) => void write('includeSubagents', event.target.checked),
            }),
          ),
          React.createElement(Field, { label: '完成提示音', hint: '仅成功完成一轮对话时响一次；工具失败/取消/切换会话不响。默认关闭。' },
            React.createElement('input', {
              type: 'checkbox', checked: value.soundEnabled === true, disabled: !writable,
              onChange: (event) => void write('soundEnabled', event.target.checked),
            }),
          ),
          React.createElement(Field, { label: '提示音音色', hint: '叮咚 / 气泡 / 轻柔，与 token-pet 同款双音包络。' },
            React.createElement('select', {
              value: value.soundTheme ?? 'chime', disabled: !writable, style: selectStyle,
              onChange: (event) => void write('soundTheme', event.target.value),
            },
            React.createElement('option', { value: 'chime' }, '叮咚'),
            React.createElement('option', { value: 'pop' }, '气泡'),
            React.createElement('option', { value: 'soft' }, '轻柔')),
          ),
          React.createElement(Field, { label: '提示音音量', hint: `${Math.round((value.soundVolume ?? 1) * 100)}%` },
            React.createElement('input', {
              type: 'range', min: 0, max: 1, step: 0.05, value: value.soundVolume ?? 1,
              disabled: status !== 'ready',
              onChange: (event) => void writeSlider('soundVolume', Number(event.target.value)),
            }),
          ),
          React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
            React.createElement('button', {
              type: 'button', style: linkButtonStyle, disabled: status !== 'ready' || soundBusy,
              onClick: () => void previewSound(),
            }, soundBusy ? '试听中…' : '试听提示音'),
            soundStatus ? React.createElement('small', { role: 'status', style: mutedStyle }, soundStatus) : null,
          ),
          busy ? React.createElement('small', { role: 'status' }, '正在保存…') : null,
        ),
    )
  }

  function apply(ctx) {
    ctx.slots.inject('settings.plugin.item', () => ctx.slots.register({
      name: 'settings.plugin.item', id: 'dafeiyu-buchibaifan', order: 30,
      inject: () => ({}),
    }, BigFishCard))
  }

  module.exports = {
    name: 'dafeiyu-buchibaifan-client',
    inject: ['slots'],
    apply,
  }
  return module.exports
} })
