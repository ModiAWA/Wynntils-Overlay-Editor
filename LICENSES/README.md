# 许可证分层说明

本仓库并非单一许可项目，许可证按文件和内容来源分别适用。发布或再分发时，请同时保留本说明、根目录 `LICENSE` 和下列第三方声明。

## MIT：原创工具代码

根目录 `LICENSE` 中的 MIT 许可证适用于本项目原创的编辑器实现、样式、测试、检查脚本、同步脚本以及没有另行标注来源的文档。它不自动覆盖下方的 Wynntils 内容。

## LGPL-3.0：Wynntils 内容

以下内容来自或依据 [Wynntils/Wynntils](https://github.com/Wynntils/Wynntils)，按 GNU Lesser General Public License v3.0 分发：

- `js/functions.generated.js` 中由 Wynntils 源码和官方语言文件生成的函数元数据与描述。
- `js/resources.generated.js` 中描述 Wynntils 字体资源的上游派生元数据。
- `assets/fonts/` 中从 Wynntils 上游仓库复制的位图字体资源。

许可证原文位于 `LICENSES/Wynntils-LGPL-3.0.txt`。精确的上游 Release、commit、仓库路径和资源清单见 `THIRD_PARTY_NOTICES.md` 及相关生成文件中的来源元数据。

## 再分发时

- 不要删除或替换 Wynntils 的版权、来源和许可证说明。
- 修改原创工具代码时，可以继续按 MIT 分发，但不要把 Wynntils 内容重新标成 MIT、GPL 或 AGPL。
- 如果无法确定某个文件的来源，按第三方内容处理，并在发布前补充来源和许可证记录。
