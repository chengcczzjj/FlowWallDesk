# FlowWallDesk UI Demo — 开发指南

> 给大模型看的上下文文档。新开窗口时把此文件内容贴到第一条 prompt 即可。

---

## 项目简介

FlowWallDesk 是一个 Windows 桌面动态壁纸应用（从 Lively Wallpaper 重构而来）。
为了加速 UI 迭代，我用 HTML/CSS/JS 做了一个完整的 UI 原型，改好后会迁移回 WinUI 3 XAML。

## 文件结构

```
demo/
├── index.html          ← 主文件，所有页面/对话框都在这里（约1200行）
├── styles.css          ← WinUI Light 主题 CSS（约1130行）
├── app.js              ← 交互逻辑（导航/对话框/右键菜单/卡片渲染，约240行）
├── mapping.json        ← HTML元素 ↔ WinUI XAML 文件的映射关系（迁移用）
├── CHANGELOG.md        ← 变更日志（每轮改完在此追加记录）
├── server.js           ← 备用 Node.js 静态服务器
├── index.baseline.html ← 基线快照，不要修改
├── styles.baseline.css ← 基线快照，不要修改
├── app.baseline.js     ← 基线快照，不要修改
└── DEV_GUIDE.md        ← 本文件
```

## 预览方式

浏览器打开：`http://localhost:8080/demo/index.html`
（需在项目根目录运行 `npx serve`，端口 8080）

或启用备用服务器：`node demo/server.js`（端口 3000）

## 当前 UI 包含内容

### 页面（6个）
| 页面 | HTML id | 说明 |
|------|---------|------|
| 资源库 | `#page-library` | 壁纸卡片网格，272×153px，拖放区域 |
| 通用设置 | `#page-settings-general` | 开机自启动/托盘图标/动画效果/主题/字体大小.. |
| 性能设置 | `#page-settings-performance` | 应用聚焦/全屏/画中画/节能/远程桌面等播放规则 |
| 壁纸设置 | `#page-settings-wallpaper` | 视频播放器/浏览器选择/流媒体/音频设备.. |
| 屏保设置 | `#page-settings-screensaver` | 屏保壁纸外观/音频/系统锁屏 |
| 系统设置 | `#page-settings-system` | 任务栏主题/日志/调试/导出日志/切频道 |

### 对话框（7个）
| 对话框 | HTML id | 触发方式 |
|--------|---------|----------|
| 添加壁纸 | `#dialog-add-wallpaper` | 导航栏 + 号 |
| 关于 | `#dialog-about` | 溢出菜单 → 关于 |
| 帮助 | `#dialog-help` | 溢出菜单 → 帮助 |
| 主题 | `#dialog-theme` | 溢出菜单 → 主题 |
| 控制面板 | `#dialog-control-panel` | 导航栏显示器图标 |
| 壁纸详情 | `#dialog-wallpaper-about` | 右键菜单 → 关于 |
| 删除确认 | `#dialog-delete-confirm` | 右键菜单 → 删除 |

### 导航结构
- **主模式**：左侧只有"资源库"一个Tab + 右侧按钮（添加/控制面板/设置/溢出菜单）
- **设置模式**：点击设置图标进入，显示返回箭头 + 5个设置Tab，隐藏右侧按钮和搜索框

### 右键菜单
- 壁纸卡片右键：关于/设为壁纸/预览/自定义/磁盘显示/分享/举报/删除/编辑

## CSS 设计系统

使用 CSS 变量模拟 WinUI Light 主题：
- 颜色：`--bg-solid`, `--text-primary`, `--accent` 等
- 圆角：`--radius-sm/md/lg`
- 阴影：`--shadow-card/dialog/flyout`
- 字号：`--font-size-caption/body/subtitle/title/header`

组件样式类：
- `.settings-card` — WinUI SettingsCard
- `.settings-expander` — WinUI SettingsExpander（可展开）
- `.toggle-switch` — WinUI ToggleSwitch
- `.combo-box` — WinUI ComboBox
- `.slider` — WinUI Slider
- `.listbox-toggle` — WinUI ListBox 用作 ▷/∥ 切换选择器
- `.info-bar` — WinUI InfoBar
- `.dialog-overlay` `.dialog` — WinUI ContentDialog
- `.context-menu` — WinUI MenuFlyout

图标使用 Segoe MDL2 Assets 字体，Unicode 编码（如 `&#xE713;` = 设置齿轮）。

## 交互逻辑（app.js）

关键函数：
- `switchPage(pageId)` — 切换页面/Tab
- `enterSettings()` / `exitSettings()` — 进出设置模式
- `openDialog(id)` / `closeDialog(id)` — 弹窗管理
- `toggleExpander(header)` — 展开/折叠 SettingsExpander
- `showContextMenu(event, menuId)` — 右键菜单
- `wallpapers[]` — 10个默认壁纸数据
- `placeholders{}` — 缩略图占位符映射

## 开发规则

1. **只改这三个文件**：`index.html`、`styles.css`、`app.js`
2. **不要动 baseline 文件**：`*.baseline.*` 是基线快照，用于迁移时 diff
3. **每轮改完后**：在 `CHANGELOG.md` 末尾追加一条变更记录，格式如下：
   ```
   ## YYYY-MM-DD 第N轮
   - 【新增】描述（对应页面/组件）
   - 【删除】描述（对应页面/组件）
   - 【修改】描述（对应页面/组件）
   - 【布局】描述（对应页面/组件）
   - 【样式】描述（对应页面/组件）
   ```
4. **保持 HTML 结构语义化**：每个页面用 `<div class="page" id="page-xxx">`，设置组用 `.settings-group`，卡片用 `.settings-card`
5. **图标用 Unicode**：`<span class="icon">&#xE713;</span>`，不要用图片代替
6. **不要引入外部框架**（React/Vue/Tailwind）— 保持原生 HTML/CSS/JS

## 迁移到 WinUI 时的对照

`mapping.json` 记录了每个 HTML 元素对应的 XAML 文件路径。
改完 demo 后，回到 WinUI 项目时：
1. 看 `CHANGELOG.md` 知道改了什么
2. 看 `mapping.json` 知道改哪个 XAML 文件
3. diff `index.html` vs `index.baseline.html` 查漏补缺

## 已知问题

- 部分设置项文本与 XAML 源码有细微差异（非阻塞，迁移时再精修）
- 壁纸缩略图引用了本地路径 `../assets/wallpapers/...`，需要服务器运行才能显示
- Segoe MDL2 Assets 字体需 Windows 系统支持，macOS/Linux 下图标显示为方块
