import Gio from 'gi://Gio'

const ACTIONS = new Set(['start', 'stop', 'restart', 'mask', 'unmask'])
const TYPES = new Set(['system', 'user'])
const LIST_ARGS = ['--type=service,timer,mount', '--no-legend', '--plain', '--no-pager']

function launch(argv, flags) {
  const launcher = new Gio.SubprocessLauncher({flags})
  launcher.setenv('SYSTEMD_COLORS', '0', true)
  launcher.setenv('SYSTEMD_PAGER', 'cat', true)
  return launcher.spawnv(argv)
}

// Returns stdout, or null when the command could not run or produced no
// output on a non-zero exit. is-active uses a non-zero exit for inactive
// units while still printing one status line per unit, so stdout is kept.
function runSync(argv) {
  try {
    const proc = launch(
      argv,
      Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE
    )
    const [, stdout] = proc.communicate_utf8(null, null)
    const text = stdout ?? ''

    if (!proc.get_successful() && text.trim() === '')
      return null

    return text
  } catch (error) {
    console.error(`[systemd-manager] ${argv.join(' ')} failed: ${error.message}`)
    return null
  }
}

function unitNames(text) {
  if (!text)
    return []

  return text.split('\n').flatMap(line => {
    const name = line.trim().split(/\s+/)[0]
    return name ? [name] : []
  })
}

export function getServicesList(type) {
  if (!TYPES.has(type))
    return null

  const files = runSync(['systemctl', `--${type}`, 'list-unit-files', ...LIST_ARGS])
  const units = runSync(['systemctl', `--${type}`, 'list-units', ...LIST_ARGS])

  if (files === null && units === null)
    return null

  const names = [...unitNames(files), ...unitNames(units)]

  return Array.from(new Set(names)).sort((first, second) => {
    return first.toLowerCase().localeCompare(second.toLowerCase())
  })
}

function systemctlStates(type, flag, services) {
  const output = runSync([
    'systemctl', `--${type}`, '--no-pager', flag, ...services
  ])
  const lines = (output ?? '').split('\n')
  const states = {}

  services.forEach((service, index) => {
    const value = lines[index]?.trim()

    if (value)
      states[service] = value
  })

  return states
}

export function getServicesState(type, services) {
  const states = {}

  if (!TYPES.has(type) || services.length === 0)
    return states

  const active = systemctlStates(type, 'is-active', services)
  const enabled = systemctlStates(type, 'is-enabled', services)

  for (const service of services) {
    states[service] = {
      'is-active': active[service] ?? 'unknown',
      'is-enabled': enabled[service] ?? 'unknown'
    }
  }

  return states
}

export function runServiceAction(method, action, type, service) {
  if (!ACTIONS.has(action) || !TYPES.has(type))
    return

  if (typeof service !== 'string' || !service || /[\s]/.test(service))
    return

  // argv1 stays the verb so the sample pkexec policy (which matches
  // systemctl start|stop|restart) still applies. User units never go
  // through pkexec; only the pkexec command method escalates system units.
  const argv = ['systemctl', action, service, `--${type}`]

  if (Number(method) === 0 && type === 'system')
    argv.unshift('pkexec', '--user', 'root')

  try {
    const proc = launch(argv, Gio.SubprocessFlags.STDOUT_SILENCE)
    proc.wait_async(null, (source, result) => {
      try {
        source.wait_finish(result)
      } catch (error) {
        console.error(`[systemd-manager] ${action} ${service} failed: ${error.message}`)
      }
    })
  } catch (error) {
    console.error(`[systemd-manager] Failed to run ${action} on ${service}: ${error.message}`)
  }
}
