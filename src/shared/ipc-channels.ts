/**
 * IPC 通道常量集中定义。
 * 渲染进程与主进程必须使用同一组常量，避免散落硬编码字符串。
 */
export const IPC = {
  // 应用 / 窗口
  APP_QUIT: 'app:quit',
  APP_SHOW_MAIN: 'app:show-main',
  APP_GET_VERSION: 'app:get-version',
  WIN_MINIMIZE: 'win:minimize',
  WIN_MAXIMIZE_TOGGLE: 'win:maximize-toggle',
  WIN_CLOSE: 'win:close',

  // 壁纸
  WALLPAPER_LIST: 'wallpaper:list',
  WALLPAPER_APPLY: 'wallpaper:apply',
  WALLPAPER_GET_CURRENT: 'wallpaper:get-current',
  WALLPAPER_PICK_FILE: 'wallpaper:pick-file',
  WALLPAPER_IMPORT: 'wallpaper:import',
  WALLPAPER_ATTACH_STATUS: 'wallpaper:attach-status',
  WALLPAPER_SAVE_SETTINGS: 'wallpaper:save-settings',
  WALLPAPER_UPDATE_SETTING: 'wallpaper:update-setting',
  // 主进程 → 壁纸窗口
  WALLPAPER_LOAD: 'wallpaper:load',
  // 壁纸抽帧（壁纸窗口 → 主进程 → 画布窗口）
  WALLPAPER_FRAME: 'wallpaper:frame',

  // 桌面组件
  WIDGET_LIST: 'widget:list',
  WIDGET_ADD: 'widget:add',
  WIDGET_REMOVE: 'widget:remove',
  WIDGET_UPDATE: 'widget:update',
  WIDGET_UPDATE_CONFIG: 'widget:update-config',
  WIDGET_CONFIG_SAVE: 'widget:config-save',
  WIDGET_CONFIG_LOAD: 'widget:config-load',
  // 主进程 → 画布
  WIDGET_SYNC: 'widget:sync',
  // 画布 → 主进程：鼠标穿透切换
  CANVAS_SET_IGNORE_MOUSE: 'canvas:set-ignore-mouse',
  // 画布 → 主进程：原生右键菜单
  CANVAS_CONTEXT_MENU: 'canvas:context-menu',
  // 画布 → 主进程：编辑模式（z-order + 穿透 + 焦点）
  CANVAS_SET_EDIT_MODE: 'canvas:set-edit-mode',
  // 主进程 → 壁纸窗口：暂停/恢复帧捕获（全屏遮挡优化）
  WALLPAPER_PAUSE_CAPTURE: 'wallpaper:pause-capture',

  // 数据服务
  DATA_FETCH_NEWS: 'data:fetch-news',
  DATA_FETCH_STOCKS: 'data:fetch-stocks',
  DATA_GET_API_REGISTRY: 'data:get-api-registry',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
