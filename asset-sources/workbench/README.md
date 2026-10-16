# 工作台新增模型

`white-tulip.blend` 是为工作台构造的闭合白郁金香，包含单支弯曲花茎、两片叶片和六片有厚度的花瓣。通过 `tools/build_workbench_tulip.py` 在 Blender 中构建、导出 GLB，并渲染透明背景的正面、侧面和缩略图。

网页文件位于 `public/assets/workbench/white-tulip*`。模型约高 46 cm；尺寸属于建模参数，未经实物校验。网页中的白郁金香使用这个版本，原下载候选及之前的精简样片仍保留在原目录中。

`spider-lily.blend` 是红花石蒜候选的网页适配版本，保留花朵和单根主茎，隐藏原场景的体积雾，并把无法直接导出的程序化花瓣颜色简化为网页支持的材质。可运行 Blender 的 `tools/prepare_workbench_media.py -- --only spider-lily` 重新导出；原始候选保持不变。
