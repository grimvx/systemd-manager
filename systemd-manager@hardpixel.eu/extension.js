import GObject from 'gi://GObject'
import St from 'gi://St'

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js'
import * as Main from 'resource:///org/gnome/shell/ui/main.js'
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js'
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js'
import * as BoxPointer from 'resource:///org/gnome/shell/ui/boxpointer.js'
import {PACKAGE_VERSION} from 'resource:///org/gnome/shell/misc/config.js'

import * as Utils from './utils.js'
import {PopupServiceItem, PopupSettingsItem} from './widgets.js'

const SHELL_MAJOR = parseInt(PACKAGE_VERSION.split('.')[0], 10)

// Shell 51 replaced PopupMenu.close(animation) with close({animate, fadeOnly}).
// Older shells still take a PopupAnimation flag; a params object is truthy there
// and would skip the animation.
function closeMenu(menu) {
  if (SHELL_MAJOR >= 51)
    menu.close({animate: true})
  else
    menu.close(BoxPointer.PopupAnimation.FULL)
}

class SystemdManager extends PanelMenu.Button {
  static {
    GObject.registerClass(this)
  }

  constructor(ext) {
    super(0.2, 'Systemd Manager', false)

    this._ext = ext
    this._settings = ext.getSettings()
    this._settingsChangedId = this._settings.connect('changed', () => this.refresh())

    const icon = new St.Icon({
      icon_name: 'system-run-symbolic',
      style_class: 'system-status-icon'
    })

    this.add_child(icon)
    this.refresh()

    this._menuStateId = this.menu.connect('open-state-changed', () => {
      if (this.menu.isOpen)
        this.refresh()
    })

    // Settings outlive the indicator. Disconnect them even when the actor is
    // destroyed without an explicit shutdown.
    this.connect('destroy', () => this._disconnectSettings())
  }

  shutdown() {
    if (this._menuStateId && this.menu) {
      this.menu.disconnect(this._menuStateId)
      this._menuStateId = 0
    }

    this._disconnectSettings()
  }

  _disconnectSettings() {
    if (this._settingsChangedId && this._settings) {
      this._settings.disconnect(this._settingsChangedId)
      this._settingsChangedId = 0
    }
  }

  refresh() {
    this.menu.removeAll()

    const entries = this._settings.get_strv('systemd')
    const showAdd = this._settings.get_boolean('show-add')
    const showRestart = this._settings.get_boolean('show-restart')
    const showMask = this._settings.get_boolean('show-mask')
    const cmdMethod = this._settings.get_enum('command-method')
    const services = []

    for (const data of entries) {
      try {
        const entry = JSON.parse(data)

        if (entry?.service && entry?.name && entry?.type)
          services.push(entry)
      } catch (error) {
        console.error(`[systemd-manager] Ignoring invalid service entry: ${error.message}`)
      }
    }

    const stateValues = {system: {}, user: {}}

    for (const type of ['system', 'user']) {
      const names = services
        .filter(entry => entry.type === type)
        .map(entry => entry.service)

      try {
        stateValues[type] = Utils.getServicesState(type, names)
      } catch (error) {
        console.error(`[systemd-manager] Failed to read ${type} unit state: ${error.message}`)
      }
    }

    for (const {type, name, service} of services) {
      const state = stateValues[type]?.[service] ?? {}
      const isActive = state['is-active'] ?? 'unknown'
      const isEnabled = state['is-enabled'] ?? 'unknown'
      const entry = new PopupServiceItem(name, {
        isActive,
        isEnabled,
        showRestart,
        showMask
      })

      this.menu.addMenuItem(entry)

      entry.connect('toggled', (_actor, active) => {
        const action = active ? 'start' : 'stop'
        Utils.runServiceAction(cmdMethod, action, type, service)
      })

      entry.connect('restarted', () => {
        Utils.runServiceAction(cmdMethod, 'restart', type, service)
        closeMenu(this.menu)
      })

      entry.connect('mask-toggled', (_actor, masked) => {
        const action = masked ? 'unmask' : 'mask'
        Utils.runServiceAction(cmdMethod, action, type, service)
        closeMenu(this.menu)
      })
    }

    if (showAdd && services.length > 0)
      this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem())

    if (showAdd)
      this.menu.addMenuItem(new PopupSettingsItem(this._ext, 'Add services'))
  }
}

export default class SystemdManagerExtension extends Extension {
  enable() {
    this._indicator = new SystemdManager(this)
    Main.panel.addToStatusArea('systemdManager', this._indicator)
  }

  disable() {
    this._indicator?.shutdown()
    this._indicator?.destroy()
    this._indicator = null
  }
}
