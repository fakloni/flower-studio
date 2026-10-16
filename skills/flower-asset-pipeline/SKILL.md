---
name: flower-asset-pipeline
description: Produce realistic single-stem flower and foliage assets from photo references using imagegen-assisted Blender modeling or Tripo followed by Blender cleanup. Use for flower-library 3D production, multi-angle renders, and batches of floral editor assets; AI images are not botanical evidence.
---

# 花材写实建模

交付可编辑单支模型、GLB、多角度图片和来源清单。“真实”指写实外观；区分实物照片、AI 图片和模型渲染，未核实的品种、背面或尺寸不能宣称已还原。

## 路线与输入

先读项目资产记录及现有参考，沿用稳定产品 ID、版本及既有素材。记录品种／颜色／阶段、单头或多头、逻辑支数、单位和尺寸来源。待核名项继续寻找证据，不能按模糊市场名建成确定品种。

- 默认本地：真实照片 → 必要时 imagegen 补参考／材质 → Blender 参数化或手工建模。读 [本地路线](references/local-blender.md)。
- 用户选择 Tripo 且本地有 `TRIPO_API_KEY`：图片 → Tripo 候选 → Blender 修整。读 [Tripo 路线](references/tripo.md)。Key 的存在本身不授权付费任务；沿用用户当前已授权的产品范围和预算，不重复确认已有授权。
- 没有 Key 时继续本地可完成工作，把 API 路线状态标为未实测。两条路线对照时分别记录输入和生成版本。

采集、提示词和来源记录见 [参考图片](references/references-and-prompts.md)。有足够真实参考即可建模，不固定要求每种花都生成四张 AI 视图。

## 试点与批量

新形态类别先做一个可审阅试点，比较真实参考、花头正侧背、整支比例与网页 GLB。已有合格的同类别模板可以复用。不能把非洲菊脚本套用于玫瑰、康乃馨、兰类或多头枝条。

附带 `scripts/build_gerbera.py` 处理无叶单头半重瓣非洲菊候选，并非精确 Atlanta 品种复制器；可配置花瓣和花心颜色。`scripts/build_botanical.py` 提供玫瑰、康乃馨、百合、铃兰、满天星、银叶桉、黄金球、洋桔梗的形态试点。它们是参数化写实参考，每种仍需照片对照和网页验收，不保证品种精确还原。

批量使用逐产品／逐版本规格；先检查参考和模板是否满足用途，缺资料项留在采集队列，不填假同款。`scripts/batch_local.py` 会选择已支持的形态建模器并保存逐项结果，未知形态返回需要对应建模器。不自动把候选写入已发布花材库；用户明确要求加入本地网站时，在检查后用新素材 ID 接入，保留旧作品 ID。

## 共同验收

输出到当前项目候选目录，每次新版本，保留原图、提示词、规格和源文件。常用交付：`source.blend`、`stem.glb`、`front/left/back/right.png`、花头细节图及 `manifest.json`。

- 检查一支的花头数、叶片／分枝、花托和背面；整束不能标为可逐支编辑。
- 米制控制尺寸，生成图比例不当实测；确认方向和茎底插入点。
- 从同一模型渲染，检查粘连、断茎、薄花瓣背面、透明边缘、色差和贴图。AI 多视图不能假定结构一致。
- 用 `scripts/finish_asset.py` 或项目工具导出、检查内嵌资源并重新导入。网页用途再验证浏览器渲染；Blender 特殊材质不保证完整转成 glTF。
- 技术通过只证明资产可读写，视觉是否合格另记。与真实参考明显不符时修正或标待复核，不把生成成功称为写实验收通过。

完成后显示代表性渲染，报告资产位置、路线、验证、推测部分和 Tripo 是否实际调用。自动批量的输出仍是候选，发布按项目现有授权处理。
