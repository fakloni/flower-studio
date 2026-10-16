# 参考图片与提示词

优先育种方、植物机构、自有拍摄或明确来源的图片。保存产品对应范围、来源页、作者／机构、取得日期、文件和使用状态。图鉴先补真实代表图；建模另找完整单支、花头正面、侧面、花托背面和材质细节。

手工／参数化建模可综合同品种同阶段的不同植株照片；三维生成多图输入必须检查同一对象、同姿态／比例／光照。花头俯视、整支正面、同角度裁切和真正侧视分别标记。

清晰、不遮挡、无强滤镜优先；长边约 2000 px 是目标而非门槛。放大图不能提供新的真实细节。尺寸来自实测或明确资料，植物株高不当切枝长。

## imagegen

使用可用的内置 imagegen 及其技能规范，无需另配 OpenAI API Key。只有用户明确选择 API/CLI 时才切换。先查看本地图，标明各参考负责花型还是茎叶结构。项目素材复制到项目并保存提示词。

按缺口选择：

1. 完整单支参考：保留真实花头，显示完整单支及茎底，均匀光、素色背景；缺依据的茎叶／背面标推测。检查花头／枝长比例，不从图读尺寸。
2. 补视图：基于同一主参考编辑指定角度，锁定花头数、枝叶和阶段。分别保存单视图；评审拼图不直接作为单图建模输入。结构不一致时继续找真图，或从 Blender 草模渲染几何参考。
3. 材质参考：单片花瓣／叶片，均匀光、少阴影。切图请求真正透明背景，检查 alpha 边缘；材质不作为真实扫描或核名证据。

提示词示例，按实际参考及已核实结构替换：

> Use case: product-mockup. Image 1 is the real head appearance reference; image 2 is the real stem-structure reference. Create one complete cut stem of [flower/cultivar/color/stage]. Preserve the petal character and known branch/leaf pattern. [Specify supported head count and leafless/leafed morphology.] Uniform neutral light, plain pale background, complete cut basal end, no vase/hands/packaging/text. Unseen features are inferred production reference, not verified specimen evidence. Keep [head width] relative to [stem length]; Blender controls final dimensions.

2026-10-14 非洲菊试点：AI 整支比例失败，花头过大，未用其读取尺寸。AI 花瓣 alpha 带软晕，建模器取内部 RGB，用曲面定义边缘。

规格至少记录 `productId`、`route`、`archetype`、`references[]`（origin/view/path/sourcePage）、尺寸及依据、逻辑支数、颜色／阶段、参数、`physicalDimensionsVerified`、`unverifiedParts[]` 和输出版本。素材来源区分 `real-photo`／`ai-image`／`model-render`；类别参考不视为同款，采集／生成／技术检查／视觉复核分开。
