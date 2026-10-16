# 非洲菊双路线建模试点

日期：2026-10-14。产品：P072，Atlanta 橙色半重瓣非洲菊外观参考。

## 本轮结果

已验证真实参考 → imagegen 按需补图 → Blender 参数化建模 → GLB 导出／重新导入 → 多角度渲染 → 浏览器载入与视图切换。最新模型为 [v3/stem.glb](v3/stem.glb)，源文件 [v3/source.blend](v3/source.blend)。

当前是制作候选，未加入正式花材库。花瓣排列及内圈仍比真实参考规整，花托、茎弯曲和精确瓣数是推测；技术通过不代表准确复制 Atlanta 品种或达到实物照片的还原度。

可旋转 [本地预览](http://127.0.0.1:8767/artifacts/flower-pipeline/P072/review.html)，也保留 [预览文件](review.html)。预览依赖本项目的 Three.js 及本地服务，关闭服务后可查看 PNG 或重新启动服务。

## 真实依据与 AI 输入

- [HilverdaFlorist Atlanta](https://www.hilverdaflorist.com/en/assortment/cut-flowers/assortment-cut-flowers/gerbera-standard-atlanta)：真实花头图、橙色半重瓣／绿色花心、枝长 65 cm、花径 11–13 cm 的来源参考。建模选 65 cm／12 cm；没有实测对应单支。
- [NC State 植物资料](https://plants.ces.ncsu.edu/plants/gerbera-jamesonii/common-name/gerbera-daisy/)：物种层面的无叶花茎及单个花头结构，不是 Atlanta 背面的专属证据。
- 内置 imagegen 共生成两张辅助图：[整支外观参考](../../../asset-sources/flower-pipeline/P072/v1/references/ai-whole-stem-v1.png)、[舌状花材质参考](../../../asset-sources/flower-pipeline/P072/v1/references/ai-ray-floret-v1.png)。完整提示词：[整支](../../../asset-sources/flower-pipeline/P072/v1/reference-generation-prompt.txt)、[材质](../../../asset-sources/flower-pipeline/P072/v1/petal-generation-prompt.txt)。

整支 AI 图花头／茎长比例失败，不作为尺寸依据或 Tripo 可用输入。材质图有软 alpha 光晕，建模器使用内部 RGB，花瓣边缘由网格定义。没有用图片平面替代整个三维花头。

## 模型与检查

最新版本约 2.5 MiB、49,052 三角面、8 个网格对象。纹理内嵌 GLB；导出再导入的尺寸检查通过。已生成整支正／左／背／右，以及花头正面、背面、侧前方共 7 张透明 PNG。

浏览器使用项目 Three.js，实际载入 GLB，切换花头和背面并检查控制台，无相关错误。尚未接入现有工作台，也未验证大量花支叠加的性能。

![模型花头正面](v3/head-front.png)
![模型花头背面](v3/head-back.png)

## Skill 与批次

已创建 `flower-asset-pipeline`，安装到 `C:/Users/Xander/.codex/skills/flower-asset-pipeline`；项目备份见 [SKILL.md](../../../skills/flower-asset-pipeline/SKILL.md)。包含本地路线、Tripo 路线、图片来源规则、建模／导出／批次及 API 恢复工具。

当前可执行本地模板仅为 gerbera 形态。玫瑰、康乃馨、兰类、多头花及叶材需要对应建模器和各自试点，不能直接复用此花型。

批次入口 [pilot-batch.json](../../../asset-sources/flower-pipeline/pilot-batch.json) 已实际运行，重复运行识别已有同规格候选，未再次生成。脚本通过规格校验值避免错误复用；不完整／冲突输出保留原文件并要求新版本。

## Tripo 状态

未检测到环境变量 `TRIPO_API_KEY`，未提交真实任务，也未付费。`tripo_job.py` 已按官方 v3 实现上传、单／多图提交、恢复查询及下载原始 GLB；本轮 dry-run 和 7 项离线行为测试通过。

测试包括视图分配、缺 front、恢复时不重复提交、POST 超时后停止、失败不自动重生成、输入冲突及未通过图片检查时拒绝提交。实际服务仍待 Key 和通过检查的输入图验证；当前国际站接口不宣称已兼容国内站。

## 下一次调用

可以请求：“使用 $flower-asset-pipeline，为 P072 改善内圈花瓣和自然变化，保留真实参考，输出新候选版本。”

新花型先请求对应试点；有 Tripo Key 时把它配置在本地环境，指定花材范围和生成预算后走 Tripo → Blender。Key 不发到聊天。
