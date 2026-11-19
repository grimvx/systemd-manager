import Adw from 'gi://Adw'
import GLib from 'gi://GLib'
import Gtk from 'gi://Gtk'
import Gdk from 'gi://Gdk'
import Gio from 'gi://Gio'

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'

import * as Utils from './utils.js'

const SERVICE_TYPES = ['system', 'user']
const DEFAULT_BINDING = Gio.SettingsBindFlags.DEFAULT

class SystemdManager {
  constructor(prefs, window) {
    this._settings = prefs.getSettings()
    this._window = window
    this._loadedTypes = new Set()
    this._provider = null
    this._warningId = 0
    this._display = Gdk.Display.get_default()

    if (this._display) {
      this._provider = new Gtk.CssProvider()
      this._provider.load_from_path(`${prefs.path}/settings.css`)
      Gtk.StyleContext.add_provider_for_display(
        this._display,
        this._provider,
        Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
      )
    }

    this._buildable = new Gtk.Builder()
    this._buildable.add_from_file(`${prefs.path}/settings.ui`)

    this.bindBoolean('show-add')
    this.bindBoolean('show-restart')
    this.bindEnum('command-method')
    this.bindBoolean('show-mask')

    this.connectEvent('services_selection', 'changed', this._onServiceSelect)
    this.connectEvent('service_up', 'clicked', this._onServiceMoveUp)
    this.connectEvent('service_down', 'clicked', this._onServiceMoveDown)
    this.connectEvent('service_remove', 'clicked', this._onServiceRemove)
    this.connectEvent('service_add', 'clicked', this._onServiceAdd)
    this.connectEvent('services_add_completion', 'match-selected', this._onServiceComplete)

    window.connect('destroy', () => this._dispose())

    this.updateAvailableServices()
    this.updateServicesList()
  }

  _dispose() {
    if (this._warningId) {
      GLib.source_remove(this._warningId)
      this._warningId = 0
    }

    if (this._provider && this._display) {
      Gtk.StyleContext.remove_provider_for_display(this._display, this._provider)
      this._provider = null
    }
  }

  getObject(name) {
    return this._buildable.get_object(name)
  }

  getInput(setting) {
    return this.getObject(setting.replace(/-/g, '_'))
  }

  bindInput(setting, prop) {
    const widget = this.getInput(setting)
    this._settings.bind(setting, widget, prop, DEFAULT_BINDING)
  }

  bindEnum(setting) {
    const widget = this.getInput(setting)
    widget.set_active(this._settings.get_enum(setting))

    widget.connect('changed', input => {
      this._settings.set_enum(setting, input.get_active())
    })
  }

  bindBoolean(setting) {
    this.bindInput(setting, 'active')
  }

  connectEvent(object, name, callback) {
    const widget = this.getObject(object)
    widget.connect(name, callback.bind(this))
  }

  showWarning(text) {
    // AlertDialog is libadwaita 1.5+ (GNOME 46). MessageDialog covers 45.
    if (Adw.AlertDialog) {
      const dialog = new Adw.AlertDialog({
        heading: 'Warning',
        body: text
      })

      dialog.add_response('ok', 'OK')
      dialog.set_default_response('ok')
      dialog.set_close_response('ok')
      dialog.present(this._window)
      return
    }

    const dialog = new Adw.MessageDialog({
      transient_for: this._window,
      modal: true,
      heading: 'Warning',
      body: text
    })

    dialog.add_response('ok', 'OK')
    dialog.set_default_response('ok')
    dialog.set_close_response('ok')
    dialog.present()
  }

  trimParameter(name) {
    if (name.includes('@'))
      return `${name.split('@')[0]}@.service`

    return name
  }

  isValidService(name) {
    const service = this.trimParameter(name)
    return this.availableServices.all.includes(service)
  }

  getServiceType(name) {
    const service = this.trimParameter(name)
    const newType = this._newEntryType
    const newList = newType && this.availableServices[newType]

    if (newList && newList.includes(service))
      return newType

    if (this.availableServices.system.includes(service))
      return 'system'

    if (this.availableServices.user.includes(service))
      return 'user'

    return null
  }

  updateAvailableServices() {
    const store = this.getObject('services_add_completion_model')
    store.clear()

    this.availableServices = {all: []}
    this._loadedTypes = new Set()

    for (const type of SERVICE_TYPES) {
      const services = Utils.getServicesList(type)

      if (services === null) {
        this.availableServices[type] = []
        continue
      }

      this._loadedTypes.add(type)
      this.availableServices[type] = services
      this.availableServices.all.push(...services)

      for (const service of services) {
        const iter = store.append()
        store.set(iter, [0, 1], [service, type])
      }
    }

    if (this._loadedTypes.size === 0) {
      this._warningId = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        this._warningId = 0
        this.showWarning('Could not list systemd units. Is systemctl available?')
        return GLib.SOURCE_REMOVE
      })
    }
  }

  updateServicesList() {
    const store = this.getObject('services_list_model')
    store.clear()

    const current = this._settings.get_strv('systemd')
    const updated = []

    for (const item of current) {
      let entry

      try {
        entry = JSON.parse(item)
      } catch (error) {
        continue
      }

      if (!entry?.name || !entry?.service || !entry?.type)
        continue

      if (!SERVICE_TYPES.includes(entry.type))
        continue

      // A failed systemctl listing must not wipe the saved services.
      if (this._loadedTypes.has(entry.type) && !this.isValidService(entry.service))
        continue

      updated.push(item)

      const iter = store.append()
      store.set(iter, [0, 1, 2], [entry.name, entry.service, entry.type])
    }

    const changed = updated.length !== current.length ||
      updated.some((value, index) => value !== current[index])

    if (changed)
      this._settings.set_strv('systemd', updated)
  }

  getServiceFromIter(iter) {
    const store = this.getObject('services_list_model')
    const name = store.get_value(iter, 0)
    const service = store.get_value(iter, 1)
    const type = store.get_value(iter, 2)

    return {name, service, type}
  }

  getSelectedService() {
    const selection = this.getObject('services_selection')
    const [any, , iter] = selection.get_selected()
    const items = this._settings.get_strv('systemd')
    const service = any && this.getServiceFromIter(iter)
    const index = service ? items.indexOf(JSON.stringify(service)) : -1

    return [index, items, iter]
  }

  _onServiceSelect() {
    const toolbar = this.getObject('services_toolbar')
    const selection = this.getObject('services_selection')

    toolbar.set_sensitive(selection.count_selected_rows() > 0)
  }

  _onServiceMove(offset) {
    const [index, items, iter] = this.getSelectedService()
    const target = index + offset

    if (index < 0 || target < 0 || target >= items.length)
      return

    const store = this.getObject('services_list_model')
    items.splice(target, 0, items.splice(index, 1)[0])
    this._settings.set_strv('systemd', items)

    const current = iter.copy()

    if (offset < 0) {
      store.iter_previous(iter)
      store.move_before(current, iter)
    } else {
      store.iter_next(iter)
      store.move_after(current, iter)
    }
  }

  _onServiceMoveUp() {
    this._onServiceMove(-1)
  }

  _onServiceMoveDown() {
    this._onServiceMove(1)
  }

  _onServiceRemove() {
    const [index, items, iter] = this.getSelectedService()

    if (index < 0)
      return

    const store = this.getObject('services_list_model')
    items.splice(index, 1)
    this._settings.set_strv('systemd', items)
    store.remove(iter)
  }

  _onServiceComplete(_comp, model, iter) {
    this._newEntryType = model.get_value(iter, 1)
    return false
  }

  _onServiceAdd() {
    const nameEntry = this.getObject('add_service_label')
    const unitEntry = this.getObject('add_service_unit')
    const name = nameEntry.get_text().trim()
    const service = unitEntry.get_text().trim()
    const type = this.getServiceType(service)

    if (!name.length || !service.length) {
      this.showWarning('No label and/or service specified')
      return
    }

    if (!this.isValidService(service) || !type) {
      this.showWarning('Service does not exist')
      return
    }

    const id = JSON.stringify({name, service, type})
    const items = this._settings.get_strv('systemd')
    const index = items.indexOf(id)
    const store = this.getObject('services_list_model')

    if (index < 0) {
      items.push(id)
      this._settings.set_strv('systemd', items)

      const iter = store.append()
      store.set(iter, [0, 1, 2], [name, service, type])
    }

    nameEntry.set_text('')
    unitEntry.set_text('')
    this._newEntryType = null
  }
}

export default class SystemdManagerPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const manager = new SystemdManager(this, window)

    window.add(manager.getObject('services_page'))
    window.add(manager.getObject('settings_page'))
    window.set_default_size(620, 680)
  }
}
