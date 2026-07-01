/**
 * 运行时路径解析
 *
 * data/logs 优先使用 GOOFISH_DATA_DIR（Electron 主进程设置为 app.getPath('userData')），
 * 回退到 process.cwd()。
 */
export function getDataDir(): string {
    return process.env.GOOFISH_DATA_DIR ?? process.cwd()
}
