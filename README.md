# Systemd Manager
Systemd Manager is a Gnome Shell Extension which allows you to start/stop systemd services via a menu in the status area in the top panel. You can preselect which services should be shown in the extension preferences dialog.

![Screenshot](https://raw.githubusercontent.com/hardpixel/systemd-manager/master/screenshot.png)

## Install
GNOME Shell 45 through 51 are supported. The copy published on extensions.gnome.org only covers Shell versions up to 44.

### CachyOS / Arch
Install the build tools. A normal GNOME install already has `polkit` (`pkexec`) and `systemd`.

```bash
sudo pacman -S --needed gnome-shell glib2 make
```

`gnome-shell` provides `gnome-extensions`. `glib2` provides `glib-compile-schemas`.

From this repository:

```bash
make pack
gnome-extensions install --force build/systemd-manager@hardpixel.eu.shell-extension.zip
gnome-extensions enable systemd-manager@hardpixel.eu
```

Log out of the Wayland session and log back in so GNOME Shell loads the extension. Open the preferences:

```bash
gnome-extensions prefs systemd-manager@hardpixel.eu
```

The extension UUID is `systemd-manager@hardpixel.eu`.

With Node.js installed, `yarn install && yarn package` writes `build/systemd-manager-v21.zip` as well. `gnome-extensions install --force` accepts that zip too.

### Gnome Shell Extensions
For Gnome versions up to 44 you can install the extension from the official extensions resource page [here](https://extensions.gnome.org/extension/4174/systemd-manager).

### Packages
Arch Linux: [AUR package](https://aur.archlinux.org/packages/gnome-shell-extension-systemd-manager)

## Authorization
Done via a password prompt from the command `pkexec` of the polkit package. This command usually pops up a graphical password prompt.

### Without Password Prompt
If you would like to be able to start services without getting prompted for a password, you need to configure a polkit policy.

#### Using pkexec (default)
The policy file [org.freedesktop.policykit.pkexec.systemctl.policy](systemd-policies/org.freedesktop.policykit.pkexec.systemctl.policy) allows the execution of `systemctl [start|stop]` without a password
confirmation. Copy the file in your polkit policy folder (usually: `/usr/share/polkit-1/actions`).

#### Using systemctl
You can also choose to use `systemctl` natively and bypass a password prompt. To do this, add the policy file [10-service_status.rules](systemd-policies/10-service_status.rules) to `/etc/polkit-1/rules.d`.

Feel free to change the `wheel` group noted in the file to any other group that you see fit.

## Contributing
Bug reports and pull requests are welcome on GitHub at https://github.com/hardpixel/systemd-manager.

## License
Systemd Manager is available as open source under the terms of the [GPLv3](http://www.gnu.org/licenses/gpl-3.0.en.html)

## Credits
Fork of the Gnome Shell extension [Services Systemd](https://github.com/petres/gnome-shell-extension-services-systemd/).
