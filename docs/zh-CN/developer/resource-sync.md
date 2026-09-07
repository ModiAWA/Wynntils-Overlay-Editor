# 函数和字体资源同步

[开发文档入口](README.md) · [English](../../en-US/developer/resource-sync.md) · [架构说明](architecture.md)

编辑器运行时不访问 GitHub。函数元数据、翻译和字体位图由脚本读取 Wynntils 官方仓库，校验后写入仓库内快照。

## 函数快照

同步脚本读取官方 Release 中的 FunctionManager、函数源码和英文/中文翻译，生成函数目录与中文搜索数据：

```bash
# 跟随最新稳定 Release
node scripts/sync-functions.mjs

# 固定到指定 release 或 commit
node scripts/sync-functions.mjs --ref v4.2.8

# 按当前快照记录的 ref 检查，不主动跟随最新版本
node scripts/sync-functions.mjs --check
```

检查命令默认使用生成文件里记录的固定 ref，保证日常 CI 可复现；只有主动运行同步命令时才会跟随最新稳定 Release。两类命令都支持通过 `--ref` 显式覆盖版本。

脚本会拒绝缺少源码、注册类、返回类型、官方英文描述或关键函数的候选数据，也会阻止函数数量异常骤减。生成文件应由脚本更新，不要直接编辑。

## 浏览器缓存版本

`index.html` 中本地 JavaScript 和 CSS 的 `?v=` 参数由缓存版本脚本按文件内容维护：

```bash
# 修改本地 JS/CSS 后更新实际变更文件的版本
node scripts/sync-cache-versions.mjs

# CI 或提交前检查版本与文件是否同步
node scripts/sync-cache-versions.mjs --check
```

脚本使用 `cache-versions.json` 记录 JS/CSS 文件哈希。文件内容未变化时保留原版本；内容变化且版本号仍为旧数字时自动递增。字体 PNG 的内容哈希记录在 `js/resources.generated.js` 中，渲染器会按 `?v=` 将其追加到图片 URL。上游同步工作流会在生成快照后自动运行相关脚本。

## 字体资源

字体同步通过 GitHub Contents API 读取 five.json、banners.json 和对应 PNG：

```bash
# 更新资源和清单
node scripts/sync-resources.mjs

# 检查当前资源快照与记录的 commit
node scripts/sync-resources.mjs --check

# 固定到指定 release 或 commit
node scripts/sync-resources.mjs --ref v4.2.8
```

写入前会校验 PNG 签名、类型和分辨率（宽高均不超过 4096）。生成的清单、许可证来源中记录的 commit 以及 `assets/fonts/` 下的 PNG 都采用原子替换；任一步失败即回滚，保留上一份完整快照。

## 提交和审阅

同步工作流位于：

- .github/workflows/sync-wynntils-functions.yml
- .github/workflows/sync-wynntils-resources.yml

工作流定期检查官方稳定版本。有变化且测试通过时，会打开或更新自动化 PR，不直接写入默认分支。审阅同步 PR 时重点确认：

- 上游 ref、commit 和来源说明一致；
- 生成文件中的函数/资源数量没有异常变化；
- pnpm check、独立的函数/资源检查和相关测试通过；
- 资源没有混入仓库外的字体或未声明的第三方内容。

资源检查需要 GitHub API。CI 使用 GITHUB_TOKEN；本地可设置同名环境变量提高速率限制，但不要输出或提交令牌。
