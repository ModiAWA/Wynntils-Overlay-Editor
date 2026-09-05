# 开发流程与测试

[开发文档入口](README.md) · [English](../../en-US/developer/development.md) · [资源同步](resource-sync.md)

## 环境

- Node.js 22
- pnpm 11（以仓库锁定的版本策略为准）
- Chromium（浏览器回归测试需要）

安装依赖：

```bash
pnpm install
pnpm exec playwright install chromium
```

编辑器运行时不需要 node_modules；依赖只用于开发期格式检查、同步脚本和自动化测试。

## 常用命令

```bash
# 格式化源文件和文档
pnpm format

# 格式检查和 JavaScript 语法检查
pnpm check

# Node.js 单元测试
pnpm test:frontend

# Chromium 浏览器测试
pnpm test:wynntils-browser

# 完整测试
pnpm test

# 检查资源快照
pnpm check:wynntils-functions
pnpm check:wynntils-resources

# 检查空白字符
git diff --check
```

资源检查需要访问 GitHub。设置 GITHUB_TOKEN 可以提高 API 速率限制，但不要把令牌写入文件、日志或提交。

## 目录边界

- index.html：静态入口、表单和可访问性标记。
- styles.css：页面布局、响应式样式和主题变量。
- js/template-parser.js：Wynntils 表达式解析和语法范围。
- js/editor-core.js：编辑器兼容门面、校验和示例配置。
- js/editor-formatting.js：格式化、格式码扫描、颜色应用和文本插入。
- js/template-simulator.js：固定示例状态下的安全函数模拟。
- js/canvas-renderer.js：格式码、字体 provider、控制序列和 glyph 的 Canvas 渲染。
- js/preview-controller.js：预览状态、警告和渲染调度。
- js/function-catalog.js：函数索引、别名、分类、搜索和插入示例。
- js/function-browser.js：函数目录的键盘和 DOM 交互。
- js/ai-assistant.js：AI 请求、响应解析、工具调用和提案防线。
- js/ai-controller.js：AI 表单状态与页面控制器适配。
- js/simulation-profile.js：固定的示例游戏状态。
- js/functions.generated.js、js/functions.zh.js、js/resources.generated.js：由同步脚本生成的快照，不要手工编辑。
- tests/editor.test.js：Node.js 单元和契约测试。
- tests/browser/editor.spec.js：Chromium 无头浏览器回归测试。
- scripts/sync-functions.mjs、scripts/sync-resources.mjs、scripts/check-js.mjs：函数/字体资源同步与 JavaScript 语法检查。
- tests/browser/static-server.mjs：浏览器回归测试使用的本地静态服务器。

浏览器按普通脚本顺序加载模块，不依赖打包器。新增模块时必须同步 index.html 的加载顺序、启动检查、语法检查脚本和测试。

## 修改原则

1. 先阅读调用链和相关测试，再修改行为。
2. 保持解析、模拟和 Canvas 对同一格式的定义一致。
3. 无法可靠模拟的函数要保留明确占位和警告，不要伪造实时值。
4. 外部输入使用安全 DOM API；不要把模型或远程 API 文本直接拼进 innerHTML。
5. 预览必须受总文本长度预算约束，不在主线程执行用户提供的正则表达式。
6. 响应式布局要检查桌面、767px、719px 和 360px，确保固定区域不遮挡内容。

## 提交前清单

- pnpm format
- pnpm check
- pnpm test
- pnpm check:wynntils-functions
- pnpm check:wynntils-resources
- git diff --check
- 检查 README 和对应语言文档中的链接、命令和版本说明。

如果只修改文档，至少运行 pnpm format、pnpm check 和 git diff --check；交付前仍建议运行完整 pnpm test。
