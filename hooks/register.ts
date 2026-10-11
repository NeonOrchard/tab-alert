import type { EngineInterface, Register } from 'claude-code'

// tab-alert: while Claude waits on you (a permission prompt, a question, an MCP
// server asking for input), the tab flashes until you answer.
// - Inside tmux the window's tab flashes red, and stops once you switch to it.
// - Elsewhere (Warp, iTerm2, ...) the tab's title flashes, and stops when you
//   answer or type.

const FLASH_MS = 800
const ALERT = '● Claude needs you'
const TMUX_ALERT = 'fg=#1e2030,bg=#ed8796,bold'
// The notices that mean Claude is waiting on an answer. `idle_prompt` (Claude
// done and idle a while) is left out: that is no question.
const ASKING = new Set(['permission_prompt', 'elicitation_dialog'])

// `ps -o tty=` output to a device path, or undefined with no terminal.
export function ttyPath(out: string): string | undefined {
  for (const line of out.split('\n')) {
    const t = line.trim()
    if (t && !/^\?+$/.test(t)) return t.startsWith('/') ? t : `/dev/${t}`
  }
  return undefined
}

// What the tab says on each beat of the flash.
export function beatTitle(on: boolean, base: string): string {
  return on ? ALERT : base
}

// The folder's own name, the tab's resting title when Claude gave none.
export function folderName(cwd: string): string {
  return cwd.split(/[\\/]/).filter(Boolean).pop() ?? cwd
}

let timer: { cancel(): void } | undefined
let beat = false
let base = ''
let tty: string | null | undefined
let pane: string | null | undefined
let windowId: string | undefined

async function tmuxPane($: EngineInterface): Promise<string | null> {
  if (pane === undefined) pane = (await $.env.get('TMUX_PANE')) || null
  return pane
}

// Claude's terminal, found from a child: the shell shares it.
async function terminal($: EngineInterface): Promise<string | null> {
  if (tty !== undefined) return tty
  const r = await $.process.run(['sh', '-c', 'ps -o tty= -p $$; ps -o tty= -p $PPID']).catch(() => undefined)
  tty = (r?.exitCode === 0 && ttyPath(r.stdout)) || null
  return tty
}

async function setTitle($: EngineInterface, title: string) {
  const dev = await terminal($)
  if (!dev) return
  await $.process.run(['sh', '-c', 'printf "\\033]2;%s\\007" "$1" > "$2"', 'sh', title, dev]).catch(() => undefined)
}

async function tmux($: EngineInterface, args: string[]) {
  return $.process.run(['tmux', ...args]).catch(() => undefined)
}

async function tick($: EngineInterface) {
  const p = await tmuxPane($)
  if (p && windowId) {
    // Switching to the window is the answer to the flash.
    const r = await tmux($, ['display', '-p', '-t', p, '#{window_active}'])
    if (r?.stdout.trim() === '1') return stop($)
    beat = !beat
    await tmux($, beat
      ? ['set', '-w', '-t', windowId, 'window-status-style', TMUX_ALERT]
      : ['set', '-wu', '-t', windowId, 'window-status-style'])
    return
  }
  beat = !beat
  await setTitle($, beatTitle(beat, base))
}

async function start($: EngineInterface) {
  if (timer) return
  if (!base) base = folderName(await $.session.cwd())
  const p = await tmuxPane($)
  if (p) {
    const r = await tmux($, ['display', '-p', '-t', p, '#{window_id} #{window_active}'])
    const [id, active] = (r?.stdout.trim() ?? '').split(' ')
    // Already looking at it: nothing to flash.
    if (!id || active === '1') return
    windowId = id
  }
  beat = false
  timer = $.clock.every(FLASH_MS, () => { void tick($) })
  void tick($)
}

async function stop($: EngineInterface) {
  if (!timer) return
  timer.cancel()
  timer = undefined
  beat = false
  if (windowId) {
    await tmux($, ['set', '-wu', '-t', windowId, 'window-status-style'])
    windowId = undefined
  } else {
    await setTitle($, base)
  }
}

// Our work never holds up Claude: it runs beside the event and swallows errors.
const later = (work: Promise<unknown>) => { void work.catch(() => undefined) }

// Calls that went to a permission prompt; only their own finish ends the flash,
// so other tools finishing meanwhile don't.
const asked = new Set<string>()

export const register: Register = on => {
  // Claude's own name for the chat, the tab's resting title.
  on('classic.SessionStart', async ($, e, next) => {
    if (e.session_title) base = e.session_title
    return next(e)
  })
  on('classic.UserPromptSubmit', async ($, e, next) => {
    if (e.session_title) base = e.session_title
    return next(e)
  })

  // A permission prompt, or an MCP server asking for input.
  on('classic.Notification', async ($, e, next) => {
    if (ASKING.has(e.notification_type)) later(start($))
    return next(e)
  })
  on('tool.check', async ($, e, next) => {
    const r = await next(e)
    if (r.decision === 'ask' && e.tool_use_id) asked.add(e.tool_use_id)
    return r
  })

  // A question: flash while it is open.
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    later(start($))
    try {
      return await next(e)
    } finally {
      later(stop($))
    }
  })
  on('tool.call', async ($, e, next) => {
    const r = await next(e)
    if (e.tool_use_id && asked.delete(e.tool_use_id)) later(stop($))
    return r
  })

  // Any word from you ends it too.
  on('prompt.submit', async ($, e, next) => (later(stop($)), next(e)))
  on('prompt.edit', async ($, e, next) => (later(stop($)), next(e)))
  on('turn.start', async ($, e, next) => (later(stop($)), next(e)))
  on('session.end', async ($, e, next) => (later(stop($)), next(e)))
}
