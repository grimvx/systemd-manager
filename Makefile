UUID := systemd-manager@hardpixel.eu
SRC := $(UUID)
OUT := build
ZIP := $(OUT)/$(UUID).shell-extension.zip

.PHONY: check schemas pack install clean

check: schemas
	node --check $(SRC)/extension.js
	node --check $(SRC)/prefs.js
	node --check $(SRC)/utils.js
	node --check $(SRC)/widgets.js

schemas:
	glib-compile-schemas --strict --dry-run $(SRC)/schemas

pack: schemas
	mkdir -p $(OUT)
	gnome-extensions pack $(SRC) --force --out-dir=$(OUT) \
		--extra-source=utils.js \
		--extra-source=widgets.js \
		--extra-source=settings.ui \
		--extra-source=settings.css

install: pack
	gnome-extensions install --force $(ZIP)

clean:
	rm -rf $(OUT) dist
