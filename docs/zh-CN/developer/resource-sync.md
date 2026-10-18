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

同步命令只在**内容**变化时写入文件。如果上游只是发布了新 Release，而函数目录（名称、别名、返回类型、参数、官方中英文描述）与已提交快照完全一致，脚本不会改写 `js/functions.generated.js`，工作流因此不会开 PR，也不会刷新哈希或更新 `index.html` 的 `?v=`。此时生成文件里的 ref/commit 表示“该快照内容最后一次生成时对应的上游版本”，无需跟随每一次上游发版。确实需要在这种无差异的情况下重新固定版本时，使用 `--force` 或 `WYNNTILS_FORCE=1`。

在确认“无内容变化”之前，脚本还会校验生成文件里记录的 ref 是否仍解析到记录的 commit 和日期。如果上游把 tag 改指到别处，或元数据被手工改动，即使内容一致也会重新固定版本（这是唯一预期出现“只有 ref/commit 变化”的 PR 的情况）。工作流的严格快照检查改为在同步之后运行，因此这类状态会被自动修复，而不是让任务停在检查步骤上；只有在同步没有写入任何文件时才会执行该检查。

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

字体同步同样只在内容变化时写入：如果上游新 Release 的 `five.json`、`banners.json` 以及 `assets/fonts/` 下对应 PNG 的字节与已提交快照完全一致（只有上游 commit 不同），脚本不会写入任何文件——不递增 `js/resources.generated.js` 的缓存版本、不刷新 `cache-versions.json` 的哈希、也不更新 `THIRD_PARTY_NOTICES.md` 中的 commit。`--force` 或 `WYNNTILS_FORCE=1` 可强制重新固定上游 commit。

## 提交和审阅

同步工作流位于：

- .github/workflows/sync-wynntils-functions.yml
- .github/workflows/sync-wynntils-resources.yml

工作流定期检查官方稳定版本。只有在快照内容真正变化且测试通过时，才会打开或更新自动化 PR，不直接写入默认分支；如果上游只是重新发版而内容一致，工作流会在日志里说明原因并结束，不会产生 PR、缓存版本递增或哈希刷新。手动触发工作流时可用 `force` 输入（等价于 `--force`）强制重新固定上游 ref/commit。审阅同步 PR 时重点确认：

- PR 中确实存在内容变化（函数/资源数量或条目差异）；如果只有 ref、commit 或缓存版本号变化，确认运行日志里出现了重新固定版本的说明（上游改指 tag 或元数据被手工改动）后可以接受，否则说明旧行为回归，需要检查同步脚本；
- 上游 ref、commit 和来源说明一致；
- 生成文件中的函数/资源数量没有异常变化；
- pnpm check、独立的函数/资源检查和相关测试通过；
- 资源没有混入仓库外的字体或未声明的第三方内容。

资源检查需要 GitHub API。CI 使用 GITHUB_TOKEN；本地可设置同名环境变量提高速率限制，但不要输出或提交令牌。
