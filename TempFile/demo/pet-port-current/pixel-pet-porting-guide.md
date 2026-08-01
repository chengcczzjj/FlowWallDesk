# 桌宠移植说明

这份说明用于把当前 `pixel-character-preview.html` 里的像素桌宠迁移到其他项目。当前实现是一个单文件网页预览，但核心可以拆成四层：宠物数据、Canvas 像素渲染、动作状态机、可选的图片转宠物模型服务。

## 当前文件

- `pixel-character-preview.html`：网页 UI、宠物数据、动作状态、Canvas 渲染、导出 PNG、上传图片生成宠物入口都在这里。
- `pet-generator-server.mjs`：可选的本地模型桥接服务，用视觉模型从上传图片提取角色特征，返回宠物配置 JSON。

如果只迁移桌宠渲染，不需要完整搬 UI；优先拆出 `states`、`themes`、宠物 profile 数据、`drawCharacter()` 以及它依赖的绘制函数。

## 画布规格

当前桌宠使用 Canvas 绘制：

```js
const PIXEL_DENSITY = 1;
const LOGICAL_PREVIEW_WIDTH = 80;
const LOGICAL_PREVIEW_HEIGHT = 64;
const SPRITE_OFFSET_X = 16;
const SPRITE_OFFSET_Y = 8;
```

要保持像素风效果，需要：

- Canvas 上下文设置 `imageSmoothingEnabled = false`。
- CSS 设置 `image-rendering: pixelated` 或 `crisp-edges`。
- 渲染时不要用 CSS 模糊、滤镜放大角色本体。
- 当前可见角色大致绘制在局部 `48x48` 坐标中，再通过 `SPRITE_OFFSET_X/Y` 放到 `80x64` 画布中心。

## 宠物数据结构

一个宠物建议保持这种结构：

```js
{
  id: "default-blue-companion",
  name: "晴蓝",
  locked: true,
  sourceName: "",
  profile: {
    description: "一句角色描述",
    palette: {
      accent: "#78CBE8",
      accent2: "#F0C56A",
      danger: "#E96B7A",
      ink: "#2A3B49",
      inkSoft: "#5E7C8E",
      fur: "#B7D8E8",
      furDark: "#6F94A7",
      belly: "#FFF1E7",
      muzzle: "#EFCFC3",
      mane: "#9ECBDD",
      maneLight: "#D7F2FB",
      earInner: "#F0A88F",
      spot: "#DCEEF5",
      lens: "#476679",
      lensLight: "#D8F6FF",
      blush: "#EE9AA7",
      fang: "#FFFDF2",
      shirt: "#F5EFE7",
      pants: "#8AAEC0",
      shoe: "#6A8798"
    },
    features: {
      avatarType: "human",
      characterStyle: "blueCompanion",
      earShape: "none",
      maneStyle: "long",
      tailStyle: "none",
      spotStyle: "none",
      accessory: "flower",
      vibe: "gentle"
    }
  }
}
```

`locked: true` 表示默认内置宠物，不写入用户保存列表。用户通过模型生成的新宠物是 `locked: false`，当前保存到：

```js
const PET_STORAGE_KEY = "lingyueDesk.pixelPets.v1";
```

迁移到别的项目时，可以把它换成数据库、Electron store、IndexedDB 或后端接口。

## 动作状态

动作由 `states` 定义，每个状态是一份渲染指令：

```js
idle: {
  label: "站立空闲",
  short: "待命",
  line: "站立空闲 · 稳定站立",
  eyes: "normal",
  mouth: "smile",
  arms: "idle",
  fx: "none",
  pose: "idle",
  tempo: 0.7
}
```

核心字段含义：

- `pose`：身体姿态，例如 `idle`、`sit`、`sleep`、`walk`、`jump`、`talk`、`work`。
- `eyes` / `mouth`：表情绘制参数。
- `arms`：手臂动作，例如 `wave`、`think`、`type`、`swipe`。
- `fx`：问号、感叹号、音符、眼泪、火花等特效。
- `prop`：外部道具层，例如书、耳机、浏览器窗口、代码流、电池。
- `tempo`：动画节奏倍率。

当前状态分组：

- 情绪：喜、怒、哀、乐、惊讶。
- 交互状态：说话、思考、灵感、困惑、错误。
- 基础行为：站立空闲、坐下、睡觉、走路、跳跃。
- 工作状态：读书、听音乐、上网冲浪、写代码、搜索资料、整理记忆、充电。

## 渲染入口

主入口是：

```js
drawCharacter(ctx, settings.state, settings.theme, time, settings);
```

它做的事情：

1. 清空画布。
2. 根据状态计算 `phase`、`tick`、跳跃高度、摇晃、头部倾斜等动画参数。
3. 绘制动作背景和地面阴影。
4. 根据 `features.avatarType` 选择兽类桌宠或人形桌宠渲染。
5. 绘制身体、四肢、头、脸、道具、特效。

循环动画使用：

```js
function loop(now) {
  const time = (now - startTime) / 1000;
  drawCharacter(ctx, settings.state, settings.theme, time, settings);
  requestAnimationFrame(loop);
}
```

在 React/Vue/Electron 中迁移时，只要把 `ctx` 和 `settings` 接入组件状态即可。

## 两套角色骨架

当前有两套主要绘制路径：

- 兽类 / 默认鬣狗：`drawMascotTail()`、`drawMascotLegs()`、`drawMascotBody()`、`drawMascotArms()`、`drawMascotHead()`、`drawMascotFace()`。
- 人形 / 晴蓝：通用人形函数 `drawBackHair()`、`drawLegs()`、`drawBody()`、`drawArms()`、`drawHead()`、`drawFace()`，并且 `晴蓝` 的站立空闲有专属函数 `drawBlueCompanionStanding()`。

注意：`晴蓝` 目前只有「站立空闲」使用专属站立图，其他动作仍走通用人形骨架。后续如果要统一质量，需要把坐下、睡觉、说话、工作等动作也按 `characterStyle: "blueCompanion"` 做专属分支。

## 配色和主题

`themes` 是界面主题和默认宠物配色来源。实际渲染时：

```js
function getActivePalette(themeKey) {
  const pet = getActivePet();
  const base = pet.locked ? themes[themeKey] : themes.moon;
  return {
    ...base,
    ...(pet.profile?.palette || {})
  };
}
```

也就是说：

- 内置宠物可以叠加当前主题。
- 生成宠物优先使用自己的 `profile.palette`。
- UI 背景主题由 `applyTheme()` 写入 CSS 变量。

如果别的项目只需要桌宠，不需要主题 UI，可以只保留 `palette` 合并逻辑。

## 图片生成宠物

图片生成宠物不是直接生成像素图，而是让视觉模型分析参考图，输出结构化 profile：

```txt
上传图片 -> pet-generator-server.mjs -> OpenAI Responses API -> JSON profile -> 前端 normalizePet() -> 保存并渲染
```

本地服务默认地址：

```js
const PET_GENERATOR_ENDPOINT = "http://127.0.0.1:43177/api/pets/generate";
```

启动时需要环境变量：

```bash
OPENAI_API_KEY=你的 key
OPENAI_MODEL=gpt-5.5
node pet-generator-server.mjs
```

模型不一定必须是 `gpt-5.5`，但必须支持：

- 输入图片识别。
- 按 JSON schema 输出结构化结果。
- 能稳定提取角色主色、发型/耳朵/尾巴/配饰/气质等特征。

如果目标项目暂时不做图片生成，可以不迁移 `pet-generator-server.mjs`、上传区域和 `generatePetFromImage()`。

## 最小迁移清单

只迁移桌宠显示，建议搬这些内容：

- 常量：`PIXEL_DENSITY`、`LOGICAL_PREVIEW_WIDTH`、`LOGICAL_PREVIEW_HEIGHT`、`SPRITE_OFFSET_X/Y`。
- 工具函数：`px()`、`colorMix()`、`hexToRgb()`、`hexToRgba()`。
- 数据：`states`、`themes`、默认宠物 profile。
- 渲染函数：`drawCharacter()` 以及它依赖的 `drawMascot*`、`drawHuman*`、`drawEffects()`、`drawMascotProp()`。
- 状态对象：`settings` 中的 `state`、`theme`、`speed`、`intensity`、`motion`、`effects`、`grid`。
- 动画循环：`requestAnimationFrame(loop)`。

建议拆分成：

```txt
pet-data.js       宠物 profile、states、themes
pet-renderer.js   Canvas 绘制函数和 drawCharacter
pet-store.js      宠物保存、读取、normalize
pet-generator.js  可选，图片生成宠物客户端
```

## 移植注意事项

- 保持所有动作共用同一地面基线，否则不同宠物切换时会出现站位跳动。
- 新增角色时优先补齐 `palette` 和 `features`，不要直接写死在 UI 里。
- 如果一个角色需要明显不同的形象，增加 `characterStyle` 分支，比硬套通用骨架效果更好。
- 道具和工作状态最好作为额外图层绘制，不要塞进身体骨架里。
- 导出 PNG 时要关闭平滑，并按整数倍放大。
- 如果页面过一段时间闪烁，优先检查是否有重新加载页面、重复初始化动画循环、或 UI 刷新时重建 Canvas。

