# 第三方资源与许可证说明

本文件说明仓库中第三方内容的来源和许可证。许可证按文件或内容类别分别适用；更细的文件归属见 [`LICENSES/README.md`](LICENSES/README.md)。

## 本工具代码

除下列 Wynntils 内容和其他明确标注的第三方资源外，本仓库原创工具代码按 MIT 许可证提供，许可证原文见 `LICENSE`。

## Wynntils 函数元数据与翻译

`js/functions.generated.js` 中的函数名称、别名、返回类型、参数签名和可用简体中文描述，由 [Wynntils/Wynntils](https://github.com/Wynntils/Wynntils) 的官方 Java 源码与 `zh_cn.json` 生成。

- 精确上游 Release 与 commit：见生成文件中的 `WYNNTILS_FUNCTION_META`
- 许可证：GNU Lesser General Public License v3.0
- 许可证原文：`LICENSES/Wynntils-LGPL-3.0.txt`
- 版权所有：Wynntils contributors

网页只加载仓库内经过校验的静态快照，不会在访问者浏览器中请求 GitHub，也不使用第三方函数目录服务。

## Wynntils 字体资源

本工具内置 [Wynntils/Wynntils](https://github.com/Wynntils/Wynntils) 的位图字体资源，用于完全离线的 Overlay 预览。

- 上游 commit：`0a03ed7ae17757304077134c5e60299877941e62`
- 许可证：GNU Lesser General Public License v3.0
- 许可证原文：`LICENSES/Wynntils-LGPL-3.0.txt`
- 版权所有：Wynntils contributors

内置纹理来自上游 `common/src/main/resources/assets/wynntils/textures/font/chat/`：

- `five.png`
- `ribbon_start.png`、`ribbon_end.png`
- `flag_start.png`、`flag_end.png`
- `box_start.png`、`box_end.png`

`js/resources.generated.js` 由 `scripts/sync-resources.mjs` 根据上游 `assets/wynntils/font/banners.json`、`assets/wynntils/font/five.json` 及对应纹理生成，并增加了浏览器可直接读取的本地路径与来源元数据。

Wynntils 仓库未包含 Wynncraft 服务器资源包中的完整 `minecraft:default` 和 `minecraft:banner/box` 字体纹理。本工具没有复制这些外部纹理；背景块、pill 边缘和负间距使用程序化兼容实现，并非服务器资源包的原始素材。
