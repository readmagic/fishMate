/**
 * 开机自启跨平台实现。
 *
 * Windows/macOS 用 Electron 原生 app.setLoginItemSettings；
 * Linux 上该 API 是 no-op（不写 .desktop），故手动管理
 * ~/.config/autostart/<appName>.desktop（遵循 XDG Desktop Entry 规范）。
 */
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const desktopFilePath = (): string => {
    const configHome = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')
    return path.join(configHome, 'autostart', `${app.getName()}.desktop`)
}

function linuxEnabled(): boolean {
    try {
        return fs.existsSync(desktopFilePath())
    } catch {
        return false
    }
}

function linuxSet(enabled: boolean): boolean {
    const file = desktopFilePath()
    if (enabled) {
        fs.mkdirSync(path.dirname(file), { recursive: true })
        // process.execPath：打包后指向 AppImage/安装二进制，登录时由桌面环境拉起
        const entry = [
            '[Desktop Entry]',
            'Type=Application',
            `Name=${app.getName()}`,
            `Exec=${process.execPath}`,
            'Terminal=false',
            'X-GNOME-Autostart-enabled=true',
            ''
        ].join('\n')
        fs.writeFileSync(file, entry, { mode: 0o644 })
    } else if (fs.existsSync(file)) {
        fs.unlinkSync(file)
    }
    return linuxEnabled()
}

export function getAutoLaunch(): boolean {
    if (process.platform === 'linux') return linuxEnabled()
    return app.getLoginItemSettings().openAtLogin
}

export function setAutoLaunch(enabled: boolean): boolean {
    if (process.platform === 'linux') return linuxSet(enabled)
    app.setLoginItemSettings({ openAtLogin: enabled })
    return app.getLoginItemSettings().openAtLogin
}
