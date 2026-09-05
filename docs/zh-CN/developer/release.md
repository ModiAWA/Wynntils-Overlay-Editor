# 发版与标签

[开发文档入口](README.md) · [English](../../en-US/developer/release.md) · [架构说明](architecture.md)

本项目是一个静态网页工具，不发布 npm 包。版本号以 package.json 的 version 字段为准，Git 标签必须使用 vMAJOR.MINOR.PATCH 格式，例如 v0.1.0。

## 标准发版流程

1. 在 Pull Request 中完成代码、测试和文档修改；如需发新版本，先更新 package.json 的 version。
2. 在本地运行以下检查：

```bash
pnpm format
pnpm check
pnpm test
pnpm check:wynntils-functions
pnpm check:wynntils-resources
git diff --check
```

3. 合并 Pull Request 到 main，并确认合并后的 package.json version。
4. 创建带注释的版本标签并推送：

```bash
git tag -a v0.1.0 -m "release: v0.1.0"
git push origin v0.1.0
```

5. 标签推送后，Release 工作流会检出该标签，重新执行检查和 Chromium 回归测试，确认标签版本与 package.json 一致，然后创建 GitHub Release 并附加只包含 Git 跟踪文件的源代码 ZIP。

GitHub Release 的说明由 GitHub 根据合并的提交自动生成，无需手动编写。

## 手动重试

如果标签已经存在但工作流需要重跑，可在 GitHub Actions 中选择 Release → Run workflow，输入已有的版本标签。手动运行只应使用已经推送的标签；工作流会重新验证标签和版本，若 Release 已存在则覆盖同名源代码 ZIP。

## 版本规则

- 标签去掉 v 后必须与 package.json 的 version 完全相同。
- 只使用三段式数字版本号，不要推送未匹配的标签。
- 已发布标签不要移动或强制更新；需要修复时递增补丁版本并创建新标签。
- 工作流不会向仓库推送代码，也不会修改 main 分支。
- 源代码 ZIP 只来自标签中的 Git 跟踪文件，不包含本地运行数据、依赖目录或未提交文件。
