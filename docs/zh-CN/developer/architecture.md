# 架构与数据流

[开发文档入口](README.md) · [English](../../en-US/developer/architecture.md) · [资源同步](resource-sync.md)

## 总体流程

```text
静态入口
  ├─ 原生 textarea + 高亮层
  ├─ template-parser / editor-core
  │    └─ 解析、范围、校验和诊断
  ├─ template-simulator + simulation-profile
  │    └─ 固定示例状态、类型检查、占位和总长度预算
  └─ preview-controller
       └─ canvas-renderer
            └─ 格式码、Color Template、字体 provider、控制序列和 glyph
```

页面直接加载普通 JavaScript 文件，不使用 bundler。index.html 负责脚本顺序和必需模块检查；app.js 负责组装控制器，而稳定的编辑器契约保留在 editor-core.js。

## 编辑与高亮

原生 textarea 是唯一的输入源，高亮层只根据同一文本生成可读的视觉层，从而保留输入法、选择、撤销、屏幕阅读器和键盘行为，并把解析范围提供给诊断和格式化。

template-parser.js 负责 Wynntils 表达式边界、参数和后缀规则。editor-formatting.js 负责纯文本插入、AST 格式化、格式码扫描和颜色应用。引号、转义和嵌套范围必须由解析结果处理，不能只用全局字符计数。

## 模拟与渲染

模拟器将函数调用转换为带声明类型的结果。依赖实时游戏状态的函数从 simulation-profile.js 读取固定示例值；不能安全或准确模拟的函数返回带原函数名的占位，并在预览状态中保留警告。

模拟器和 Canvas 共享总文本预算，避免嵌套的 repeat、leading_zeros 或其他函数生成超大字符串。用户提供的正则表达式不会传给 JavaScript RegExp，相关函数使用明确的 unsupported 结果，防止主线程被回溯模式阻塞。

Canvas 先解析 Minecraft/Wynntils 格式码，再处理 Color Template、shader sentinel、字体命名空间、背景控制和负间距。模拟器发出的结构化 styled-text 控制序列必须被消费，不能当作普通文字绘制。

## 状态和草稿

预览控制器区分空内容、语法暂停、有效结果和含占位结果。语法或配置无效时保留并淡化最近一次有效画面；Canvas 单次失败不会阻断编辑、诊断或草稿保存。

草稿存储只接受版本化 schema 和明确的 Info Box 配置白名单。API Key、AI 端点、模型和对话不进入草稿。多标签页冲突通过更新时间和用户确认处理，损坏或未知 schema 不会静默覆盖当前内容。

## AI 边界

AI 适配器只负责向用户指定的兼容端点发送请求和解析响应。函数搜索工具在浏览器本地执行，返回数量和对话轮数都有上限。模型建议先经过代码块提取、反转义检查和 editor-core 校验，再由用户确认应用。

Markdown 使用安全的本地 DOM 渲染器，不执行模型返回的 HTML。取消操作会终止整个请求循环；单个请求有独立超时。

## 可访问性和响应式约束

- 输入和高亮必须保持同一滚动位置。
- 诊断项可以聚焦 Content 并选中对应范围。
- aria-live 只播报新的警告身份，不因源偏移变化重复播报。
- 函数目录支持键盘导航、Escape 关闭和清晰的焦点状态。
- 粘性预览在窄屏不遮挡标题、表单和键盘焦点。

## 第三方边界

函数元数据、翻译和字体位图保留上游来源与固定 commit。工具自身代码与第三方内容的许可证边界见根目录 LICENSE、LICENSES/README.md 和 THIRD_PARTY_NOTICES.md。
