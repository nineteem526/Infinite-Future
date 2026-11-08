# 正式资产接入映射（2026-11-08）

原始 GLB 与用户文件不得覆盖；以下为初始扫描，最新接入状态见文末。`art-pipeline/asset-register.md` 的早期“无文件”条目早于后续生成结果，以该文件后半段和当前磁盘为准。

- 能源晶体 ART-003：`art-pipeline/generated/originals/ART-003-energy-crystal-v1.glb`。对应 `src/m2/content.ts` 的 worldCrystal / carriedCrystal / socketCrystal，分别在 2126 基座、相机手持、2026 发电机；`src/m2/CausalitySystem.ts` 和 `WorldState` 管理唯一物品状态，交互/碰撞独立。原件约 198 万三角、8K 贴图，需先优化并验证后接入；DeepSeek 正在执行。
- Chrono Key KEY-001：`hi3d-Chrono Key_2.glb` 是已检查的约 1.57 MB、12,000 三角轻量候选；`hi3d-Chrono Key_1.glb` 是高精原件。现有主线没有已确认的钥匙交互实体或插槽，不能假称已有绑定；可先做独立预览及映射设计。
- 画廊画框 ART-002：`art-pipeline/generated/originals/ART-002-gallery-frame-v1.glb`，对应 `src/m3/content.ts` 的左右画框和中央空白画布，剧情和交互在 `StorySystem` / `interaction.ts`。原件约 197 万三角、8K 贴图；需先优化和检查比例，传送/画布交互不依赖网格碰撞。
- Chrono Shifter ART-001：`art-pipeline/generated/originals/ART-001-chrono-shifter-v1.glb`；工程外另有 `C:/Users/a/Desktop/ART-001-chrono-shifter-v1.glb`（同名、同字节数，内容是否一致未验证）。对应 `src/m3/content.ts` 的 timeDeviceMesh、`src/m3/interaction.ts` 与 WorldState 的获取门槛；尚无确认的正式第一人称装备节点。原件约 198 万三角、8K，需优化并验收。
- Final Canvas Core：目前仅有单球形模块 `art-pipeline/generated/originals/FC-04-energy-core-v1.glb`，非完整装置，约 198 万三角、8K，节点/发光及视觉未最终验收；对应 `src/m3/content.ts` 终末核心和 StorySystem 状态。时间环、钥匙插槽、正式画布等独立 GLB 尚未发现；保留占位并等待经审核模型。
- Eve：当前项目和桌面扫描未发现确认属于 Eve 的 GLB；现有游戏中未确认可用的 Eve 对话逻辑。模型可用后再接静态角色及对话。
- 黄金/静止时代建筑：未找到已确认可用的正式建筑 GLB；当前 `src/world/eras/era2026.ts`、`era2126.ts` 及 `src/m3/content.ts` 生成占位视觉与物理实体。替换须保留现有碰撞和双时代坐标，避免将复杂装饰网格用作精确碰撞。

现有 Three.js 初始化在 `src/core/Game.ts`，M2 道具由 `createM2Content` 构建，剧情场景由 `createStoryContent` 构建，状态与交互分离。初始扫描时未发现生产用 GLTFLoader 资源模块；接入进展见下。资产接入前独立 `npm run build` 成功；工作树存在先前用户授权的未提交关卡改动，保持原样。

## 接入进展（2026-11-08）

- 晶体：游戏版 `public/assets/art003-energy-crystal-game.glb`，21,990 三角、两张 1024 贴图。已在浏览器确认 GLB 加载，并以测试定位后实操拾取、跨时代和插入发电机；用户确认显示正常。保留原模型及加载失败回退。
- 时序钥匙：`public/assets/chrono-key-game.glb`，12,000 三角，作为 2126 终末核心附近的静态视觉细节，不参与拾取或碰撞。浏览器日志确认 GLB 加载，构图与方向尚需实际画面验收。
- 加载器：`src/m2/gameAsset.ts` 使用 GLTFLoader 缓存和启动预加载，适配包围盒与回退；晶体与钥匙各有资产配置。
- 环境：Hi3D 已读取现有场景代码和参考图，正在生成单件画廊柱样板；DeepSeek 正在优化画廊画框。均未完成实际游戏验收。
- Eve：Hi3D 对话中存在静态候选版，仍等待外观验收，未移交工程，路径和接入状态待核实。
