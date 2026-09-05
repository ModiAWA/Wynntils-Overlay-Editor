# Wynntils Overlay Editor

[简体中文](README.md) | [English](README.en.md)

Wynntils Overlay Editor 是一个非官方社区工具，用于创建和预览 Wynntils Overlay，目前以 Info Box 为重点。它是无需构建步骤的静态网页：普通用户只需打开托管地址即可使用，既不用安装 Node.js，也不必连接其他宿主项目。

本工具不会导出完整的 Wynntils JSON，也不会替你创建游戏内 overlay。预览使用固定的示例状态，主要用于检查 Content 的布局、颜色、字体和格式码；实际效果以 Wynntils 游戏客户端为准。

## 快速使用

1. 打开项目提供的托管网页。
2. 载入一个示例，或在 Content 字段中输入自己的模板。
3. 使用函数目录搜索并插入表达式，查看右侧的预览和校验提示。
4. 配置颜色、字体、阴影、背景和边框等 Info Box 选项。
5. 点击“复制 Content”，在游戏的 Wynntils → Overlay Management 中创建或编辑 Info Box。

完整的编辑说明、预览边界和 AI 使用方式见[使用指南](docs/zh-CN/user/README.md)。需要本地打开、自托管或配置 AI 端点时，请查看[高级使用](docs/zh-CN/user/advanced-usage.md)。

## 文档

- [普通使用](docs/zh-CN/user/README.md)
- [高级使用：本地运行、自托管和排障](docs/zh-CN/user/advanced-usage.md)
- [开发与维护](docs/zh-CN/developer/README.md)
- [函数和字体资源同步](docs/zh-CN/developer/resource-sync.md)
- [架构与数据流](docs/zh-CN/developer/architecture.md)
- [发版与标签](docs/zh-CN/developer/release.md)
- [English documentation](docs/en-US/user/README.md)

## 主要特性

- 直接在浏览器中编辑 Wynntils Content，并保留输入法、选择、撤销和键盘操作。
- 离线函数搜索、语法高亮、校验、示例说明和 Canvas 预览。
- 对无法依赖游戏实时状态的函数显示明确的示例值或占位提示。
- 可选的 OpenAI-compatible AI 助手；不会自动覆盖 Content，应用前需要用户确认。
- 草稿只保存显式允许的 Info Box 配置，不保存 API Key、端点、模型或 AI 对话。

## 许可证

工具自身代码使用 MIT 许可证，见 [LICENSE](LICENSE)。仓库中的 Wynntils 函数元数据、翻译和字体位图属于第三方内容，其许可证和来源见 [LICENSES/README.md](LICENSES/README.md) 与 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

本工具不是 Wynntils 官方项目。Wynntils 名称、代码和资源归其各自权利人所有。
