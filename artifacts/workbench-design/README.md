# FlowerStudio 工作台设计与样片素材

日期：2026-10-12

本轮交付 S0 的工作台视觉基线和精简素材包。界面图是用内置 Image Gen 制作的设计概念，组合花束是布局与视觉目标，不是浏览器截图。独立花材与花瓶素材来自实际模型处理和 Blender 渲染。

## 查看设计稿

| 设计稿 | 用途 |
| --- | --- |
| [桌面工作台](D:/Projects/flower-studio/artifacts/workbench-design/desktop.png) | 花材选择、中央预览、配方与花瓶 |
| [手机默认状态](D:/Projects/flower-studio/artifacts/workbench-design/mobile.png) | 画布优先，底部面板收起 |
| [手机选花面板](D:/Projects/flower-studio/artifacts/workbench-design/mobile-flowers.png) | 搜索、筛选、添加，底部动作保持可见 |
| [交互与视觉规范](D:/Projects/flower-studio/docs/workbench-design-spec.md) | 控件、状态、手机行为和下一步验收 |

![桌面工作台](D:/Projects/flower-studio/artifacts/workbench-design/desktop.png)

## 样片素材包

提供粉玫瑰、白郁金香、尤加利的单支候选，以及奶油白细口瓶、鼠尾草绿竖纹瓶。每项包含 GLB、正面和侧面 PNG / WebP，以及独立 Blender 源文件。

- [素材预览](D:/Projects/flower-studio/artifacts/workbench-design/sample-pack.jpg)
- [机器可读素材清单](D:/Projects/flower-studio/public/assets/sample-pack/manifest.json)
- [素材验收记录](D:/Projects/flower-studio/artifacts/workbench-design/sample-validation.json)
- [素材处理与数量约定](D:/Projects/flower-studio/docs/workbench-sample-pack.md)
- [界面概念提示词记录](D:/Projects/flower-studio/artifacts/workbench-design/imagegen-prompts.md)

花材高度是对比用的展示规范，尚未核实实物规格。尤加利枝叶与郁金香叶片的连接需要近景检查和网页复核。花瓶尺寸为本轮构造的模型尺寸。

## 当前阶段与下一步

本轮没有初始化正式应用，也没有确定采用固定视角还是实时 3D。下一步用同一组配方，按照本轮工作台结构搭建两种网页样片，验证加载、遮挡、视角、选中与移动，并在手机上测量。

界面中的侧面 / 俯视是 3D 候选视角表达。图片路线目前仅有两个离散预览角度，不能通过旋转单张图片获得真正的任意视角。
