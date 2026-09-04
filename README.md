# Wynntils Overlay Editor

Wynntils Overlay Editor 是一个非官方社区工具，用于创建和预览 Wynntils Overlay，当前重点支持 Info Box。工具默认完全离线、无需构建步骤，直接打开 `index.html` 即可使用。除非用户主动填写 AI 助手的兼容端点和 API Key 并发起请求，页面不会访问远程 API，也不会导出完整的 Wynntils JSON。

本工具可独立运行，不依赖外部宿主项目。它不是 Wynntils 官方项目，Wynntils 名称、代码和资源归其各自权利人所有。浏览器运行时只读取仓库内的 HTML、CSS、JavaScript 和位图资源；Node.js 仅用于格式检查、函数快照同步、字体资源同步和自动化测试。

工具自身代码使用 MIT 许可证，见 [`LICENSE`](LICENSE)。仓库中的 Wynntils 函数元数据、翻译和字体位图属于第三方内容，按其 LGPL-3.0 许可和 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) 中的来源说明分发；许可证并不自动覆盖第三方内容。

安全问题请通过仓库设置的私密渠道报告；不要在公开 Issue、Pull Request 或日志中提交 API Key、个人信息或生产数据。

实时预览使用 Canvas 逐 glyph 渲染，不依赖浏览器 WOFF 字体或游戏客户端。渲染器保留 Minecraft/Wynntils 的字体命名空间、颜色、格式、位图 provider、背景重叠和负间距；内置资源的版本与来源见 `THIRD_PARTY_NOTICES.md`。

内容编辑器使用轻量级离线语法高亮区分普通文字、Minecraft 格式码、函数、参数、字符串、数字和模板标点。高亮层只负责显示，实际输入仍由原生 `textarea` 处理，因此保留浏览器的输入法、选择、撤销和辅助功能行为。

普通 Info Box 配置会以版本化草稿保存在当前浏览器中，但 API Key、端点、模型和 AI 对话不会进入草稿。未知版本或损坏的旧草稿不会被自动覆盖；多标签页同时编辑时，页面会要求用户选择载入较新版本或保留当前内容。载入示例、应用 AI 方案和格式化等整段替换都可撤销。

AI 对话中的常用 Markdown（段落、标题、列表、粗体、行内代码和围栏代码块）由本地安全 DOM 渲染器显示，不执行模型返回的 HTML。当前 Content 会作为原始 `wynntils-current` 代码块发送，而不是嵌入 JSON 字符串，避免模型把换行、引号和函数下划线复制成转义字符。

## 使用流程

### 本地运行

无需构建，可直接在浏览器打开 `index.html`；运行浏览器测试或需要避免浏览器对本地文件的限制时，使用：

```bash
pnpm install
pnpm test:wynntils-browser
```

主要目录：

- `index.html`、`styles.css`：静态页面和样式。
- `js/`：解析、校验、模拟、Canvas 渲染、函数目录和 AI 适配。
- `assets/`：Wynntils 许可范围内的预览位图资源。
- `tests/`：Node.js 单元测试和 Chromium 浏览器回归测试。
- `scripts/`：官方函数与字体资源快照同步，以及 JavaScript 语法检查。

操作步骤：

1. 在“选择示例”中载入 FPS、坐标，或“一般信息显示”示例。
2. 填写信息框内容，并按需调整颜色模板、文字阴影、字体大小、Fit Text、背景色和边框宽度。
3. 右侧函数检索支持函数名、别名和中文模糊描述。点击函数结果会把表达式插入内容字段。
4. 需要辅助时可打开“AI 帮我设计”，填写自己的 OpenAI-compatible `/v1` 或完整 Chat Completions 端点；可从兼容的 `/models` 接口获取模型并以下拉方式选择，也可手动填写模型名。API Key 按端点要求填写。AI 缺少可靠函数时会自行查询页面内置的官方函数目录，再继续生成建议；检测到通过本地校验的 `wynntils` 代码块后可由用户确认并应用。
5. 修复校验提示后点击“复制 Content”，再进入游戏内 `Wynntils -> Overlay Management` 手动创建 Info Box；其余设置按页面当前值填写。

复制的内容是供游戏内操作使用的表单结果，不是 JSON 导出；工具不会替用户创建游戏内 overlay。

## 可选 AI 助手与安全边界

- AI 助手直接从浏览器请求用户填写的 OpenAI-compatible `chat/completions` 端点，因此端点必须允许浏览器 CORS。
- “获取模型”会根据标准 `/v1` 或 `/chat/completions` 地址推导出同服务的 `/models` 接口。并非所有兼容服务都提供模型列表，失败时仍可手动填写模型名。
- API Key 只保留在当前页面的密码输入框中，不写入 `localStorage`、`sessionStorage`、URL、日志或下载文件；刷新页面后消失。
- 首轮只发送当前对话、当前 Info Box 配置和少量粗检索候选，不发送完整函数库。缺少函数时，模型可调用本地 `search_wynntils_functions`；页面在 459 项官方快照中离线检索，并只把最多 12 条结果回传给模型。
- 每轮同时提供一份从内置 `wynntils:five` 字体资源生成的 A–Z 私用区字形表、胶囊标题组装规则和完整 FPS 示例，让模型不必从“一般信息显示”成品反推标题字符。
- 标准 Chat Completions `tools`/`tool_calls` 会被优先使用；不支持工具调用的兼容端点会自动退回 `wynntils-search` 文本协议。
- 单轮对话最多执行 6 次模型请求和 3 个不重复的函数查询；重复查询会被拦截。每次模型请求独立计算 120 秒超时，前一轮耗时和本地检索不占用下一轮额度；取消按钮仍会立即终止整个循环。
- AI 回复不会自动覆盖内容；只有检测到明确的 `wynntils`/`text` 代码块、通过本地函数校验并由用户点击确认后才会应用。校验失败时最多允许 AI 连续自动修正两轮，两轮后仍有错误才禁止直接应用。
- 模型被要求在“新增/修改一项”时逐字保留其余 Content。整段被 JSON 引号包裹、函数引号字符串外的字面量 `\n` 或其他反斜杠、函数名中被 Markdown 转义的下划线，以及 HTML 空格实体，都会被本地防线拒绝并进入上述自动修正流程；`concat("\n ...")` 这类函数引号参数内的转义保持合法。
- 不使用 AI 助手时，示例、函数检索、语法高亮、Canvas 预览和说明生成仍全部离线工作。

## 模块与预览可信度

- `function-catalog.js` 负责函数索引、别名、语义搜索、分类和插入表达式；`editor-formatting.js` 负责 AST 格式化、格式码扫描、颜色应用和纯文本插入。
- `preview-controller.js`、`function-browser.js` 和 `ai-controller.js` 分别隔离 Canvas/预览状态、函数目录交互和 AI 请求适配；`editor-core.js` 保留稳定的兼容门面，浏览器仍按普通脚本离线加载。
- 页面启动前会检查必需脚本；当静态部署出现缓存版本不一致或脚本缺失时，页面会显示缺失模块名并在控制台保留诊断，不会只留下空白编辑区。
- 预览会区分空内容、语法暂停、完整模拟和含占位的模拟。无法依赖游戏实时状态的函数会显示带规范函数名的占位，并在状态区域列出本次未完整模拟的函数；模拟器 handler 抛错或返回类型不符时，也只影响当前函数。
- 459 项官方函数目录必须恰好处于“已验证模拟”或“带原因的 unsupported allowlist”之一。新增上游函数若未登记会让覆盖测试失败，过期 allowlist 项也会被报告。

## 内置函数与示例

`js/functions.generated.js` 内置函数名称、别名、返回类型、参数签名和上游元数据。函数结构与可用的简体中文描述直接来自 [Wynntils/Wynntils](https://github.com/Wynntils/Wynntils) 的稳定 Release；`js/functions.zh.js` 只保留搜索关键词、少量术语增强，以及官方尚未翻译时的后备说明。编辑器用字符 bigram 相似度、关键词命中和函数名前缀进行离线语义检索。

未输入搜索词时，函数分类只创建折叠标题，首次展开某类后才生成其中的按钮；搜索结果支持上下键、Enter 插入和 Escape 关闭，避免首屏预先创建数百个重复节点。

“一般信息显示”示例直接内嵌在 `js/editor-core.js`，包含世界、领地、货币、延迟、FPS、伤害和跑图保底等模板内容。

## 从 Wynntils 官方仓库更新函数和字体资源

生成器不会访问第三方函数目录，也不会让网页在运行时访问 GitHub。它读取 Wynntils 官方 Release 中的 `FunctionManager`、`functions/**/*.java`、`en_us.json` 和 `zh_cn.json`，完成结构校验后才原子替换离线快照：

```bash
pnpm sync:wynntils-functions
```

默认跟随最新稳定 Release；需要复现特定版本时可运行：

```bash
node scripts/sync-functions.mjs --ref v4.2.8
```

`pnpm check:wynntils-functions` 默认使用当前快照记录的固定 `ref` 重建并比较，因此日常检查具有可复现性；主动运行同步命令时才跟随最新稳定 Release。两条命令都可用 `--ref` 显式覆盖版本。

字体资源使用同样的提交固定策略，但通过 GitHub Contents API 读取 `five.json`、`banners.json` 和对应 PNG，并在写入前校验 PNG 类型、尺寸和大小。浏览器只加载提交进仓库的资源，不会在运行时请求 GitHub：

```bash
pnpm sync:wynntils-resources
```

检查当前资源快照是否与其记录的 commit 一致：

```bash
pnpm check:wynntils-resources
```

需要复现指定 release 或 commit 时可运行 `node scripts/sync-resources.mjs --ref v4.2.8`。同步过程会原子替换生成清单、许可证来源中的 commit 和 `assets/fonts/` 下的 PNG；失败时保留上一份完整快照。资源同步工作流会定期打开 PR，便于在公开前审阅上游变化。

生成器会拒绝缺少源码、注册类、返回类型、官方英文描述或关键函数的候选数据，也会阻止函数数量异常骤减。`.github/workflows/sync-wynntils-functions.yml` 每周检查一次官方稳定版；有变化且测试通过时，只更新生成文件和缓存版本，并打开或更新自动化 PR，不直接写入默认分支。

## 离线预览边界

- `concat`、条件、字符串和常用数学函数会在示例数据上执行，避免复杂段落在预览中直接消失。
- 世界、领地、货币、帧率和保底次数等依赖游戏状态的函数使用固定示例值。
- 无法离线模拟的函数显示带原函数名的占位，不伪装成真实游戏值；全部插入示例都检查非空结果和目录声明类型。
- 模拟结果与 Canvas 输入都限制为 4096 字符，超限内容会截断并显示提示；浏览器主线程不会执行用户提供的正则表达式，相关函数只显示明确占位。
- 空 Content 会清空旧画面；语法或配置无效时保留并淡化最后一次有效预览；Canvas 失败只停止预览动画，不阻断编辑或草稿保存。
- `assets/fonts/` 中的 PNG 来自 Wynntils 仓库；资源清单固定到一个明确的上游 commit。
- 对于 Wynncraft 服务器资源包中未随 Wynntils 仓库发布的字体纹理，本工具使用程序化兼容图形；因此预览仅用于布局和配色参考，并不冒充游戏客户端截图。

## 本地验证

从仓库根目录运行：

```bash
node --check js/functions.generated.js
node --check js/functions.zh.js
node --check js/resources.generated.js
node --check js/template-parser.js
node --check js/simulation-profile.js
node --check js/template-simulator.js
node --check js/draft-store.js
node --check js/canvas-renderer.js
node --check js/template-highlighter.js
node --check js/markdown-renderer.js
node --check js/ai-assistant.js
node --check js/function-catalog.js
node --check js/editor-formatting.js
node --check js/preview-controller.js
node --check js/function-browser.js
node --check js/ai-controller.js
node --check js/editor-core.js
node --check js/app.js
node --check scripts/sync-resources.mjs
node --test tests/editor.test.js
pnpm test:wynntils-browser
pnpm check:wynntils-functions
pnpm check:wynntils-resources
git diff --check
```

`check:wynntils-functions` 和 `check:wynntils-resources` 需要访问 GitHub；设置 `GITHUB_TOKEN` 可提高 GitHub API 速率限制。其余编辑器语法和单元测试均可离线运行。
