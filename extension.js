import GObject from 'gi://GObject';
import Gio from 'gi://Gio';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';
import { QuickToggle, SystemIndicator } from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const BIN = '/usr/bin/TouchpadEmulator';
const PATTERN = '(^|/)TouchpadEmulator(\\s|$)';

const TouchpadToggle = GObject.registerClass(
class TouchpadToggle extends QuickToggle {
    _init() {
        super._init({
            title: 'Touchpad Mode',
            iconName: 'input-mouse-symbolic',
            toggleMode: true,
        });

        this._proc = null;
        this._adopted = false;
        this._suppress = false;

        this.connect('notify::checked', () => {
            if (this._suppress) return;
            if (this.checked) this._start();
            else this._stop();
        });

        this._seedInitialState();
    }

    _setChecked(v) {
        if (this.checked === v) return;
        this._suppress = true;
        this.set_checked(v);
        this._suppress = false;
    }

    _seedInitialState() {
        let proc;
        try {
            proc = new Gio.Subprocess({
                argv: ['pgrep', '-f', PATTERN],
                flags: Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE,
            });
            proc.init(null);
        } catch (_) { return; }
        proc.wait_async(null, (p, res) => {
            try { p.wait_finish(res); } catch (_) { return; }
            if (p.get_successful()) {
                this._adopted = true;
                this._setChecked(true);
            }
        });
    }

    _start() {
        if (this._proc) return;
        let proc;
        try {
            proc = new Gio.Subprocess({
                argv: [BIN],
                flags: Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE,
            });
            proc.init(null);
        } catch (e) {
            Main.notifyError('Touchpad Emulator', e.message);
            this._setChecked(false);
            return;
        }
        this._proc = proc;
        this._adopted = false;
        proc.wait_async(null, (p, res) => {
            try { p.wait_finish(res); } catch (_) {}
            if (this._proc === proc) {
                this._proc = null;
                this._setChecked(false);
            }
        });
    }

    _stop() {
        if (this._proc) {
            try { this._proc.send_signal(15); } catch (_) {}
            return;
        }
        if (this._adopted) {
            try {
                const killer = new Gio.Subprocess({
                    argv: ['pkill', '-f', PATTERN],
                    flags: Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE,
                });
                killer.init(null);
            } catch (_) {}
            this._adopted = false;
        }
    }

    destroy() {
        this._proc = null;
        super.destroy();
    }
});

const TouchpadIndicator = GObject.registerClass(
class TouchpadIndicator extends SystemIndicator {
    _init() {
        super._init();
        this._toggle = new TouchpadToggle();
        this.quickSettingsItems.push(this._toggle);
    }
});

export default class TouchpadEmulatorExtension extends Extension {
    enable() {
        this._indicator = new TouchpadIndicator();
        Main.panel.statusArea.quickSettings.addExternalIndicator(this._indicator);
    }

    disable() {
        this._indicator?.quickSettingsItems.forEach(i => i.destroy());
        this._indicator?.destroy();
        this._indicator = null;
    }
}
