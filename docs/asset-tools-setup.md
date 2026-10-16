# FlowerStudio 素材工具安装记录

安装日期：2026-10-13。桌面工具采用官方便携包；素材处理使用项目独立 Python 环境。

## 工具位置

| 工具 | 版本 | 可执行文件或环境 |
| --- | --- | --- |
| Krita | 5.3.4.1 | `D:\softwares\Krita\krita-x64-5.3.4.1\bin\krita.exe` |
| Laigter | 1.14.0 | `D:\softwares\Laigter\laigter-windows\laigter.exe` |
| rembg CPU 核心 | 2.0.85 | `D:\Projects\flower-studio\.venv-assets` |
| 素材环境 Python | 3.12.14 | `.venv-assets\Scripts\python.exe` |
| 模型缓存 | — | `asset-sources\.model-cache` |

开始菜单中的 **FlowerStudio 素材工具** 文件夹包含 Krita 和 Laigter 快捷方式。下载包及 Krita 校验文件保留在 `D:\softwares\Installers\flower-studio`。

Blender 沿用现有安装 `D:\softwares\Blender\blender.exe`，Three.js 沿用现有项目依赖。

## 使用方式

在项目目录运行 `tools\asset-tools.ps1 -Action Check`，可检查程序路径与 rembg 环境。

rembg 安装的是本地 CPU 处理核心。项目提供单张图片处理入口，保留原文件，拒绝覆盖已有输出：

```powershell
.\.venv-assets\Scripts\python.exe .\tools\remove-background.py input.jpg output.png
```

默认使用轻量 `u2netp` 模型。它用于起步和运行检查，不能替代对细茎、花瓣与叶片边缘的质量验收。其他模型通过 `--model` 选择，首次运行会另行下载对应权重。

Krita 用于人工修边和素材拆层。Laigter 用于试验法线等贴图，它生成的是近似光影信息，不代表照片中花瓣的真实三维结构。

## 环境维护

系统默认 Python 3.14 保持原样。素材环境使用现有的 Python 3.12 运行时建立：

`C:\Users\Xander\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`

虚拟环境依赖这个基础运行时；基础运行时若迁移或删除，需要用 Python 3.12 重建 `.venv-assets`。依赖版本记录在 `tools/requirements-assets-lock.txt`，可通过独立环境中的 pip 安装该文件恢复。

`.venv-assets` 和模型缓存已加入 Git 忽略规则，不作为网页资源发布。

## 下载来源与校验

- [Krita 官方下载页](https://krita.org/en/download/)：Windows Portable 5.3.4.1，已对照官方 SHA256 文件校验。
- [Laigter 官方发行页](https://github.com/azagaya/laigter/releases/tag/1.14.0)：Windows ZIP，已对照 GitHub Release 提供的 SHA256 校验。
- [rembg 官方仓库](https://github.com/danielgatis/rembg)：通过 PyPI 安装 `rembg[cpu]`。

Krita、Laigter 已通过版本启动检查；Python 依赖检查通过。`u2netp` 权重已下载到项目模型缓存，CPU 推理与项目处理入口均已通过测试；测试输出含 0–255 的透明度范围。Laigter 已成功输出 256×256 法线贴图。测试使用合成图案，仅确认工具链可运行，尚未评价真实花材的抠图或光影质量。检查结果保留在 `tmp/asset-tools`。
