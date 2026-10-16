# 本地 Blender 路线

发现 Blender 路径和版本。花材项目试点为 `D:/softwares/Blender/blender.exe`（5.2.2 LTS），其他环境先检查。Intel Iris Xe 试点使用 Cycles CPU。

按真图建立花瓣／花托／茎叶结构，用 mesh、curve、Geometry Nodes 或已有资产。尺寸与外观参数分开，新形态需要对应建模器。

`build_gerbera.py`：三层长舌状花、短内圈、绿色盘状花、花托苞片和无叶花茎。照片指导外观，AI 单片辅助材质；精确瓣数、背面、茎弯曲仍未实测核验。

规格示例（纹理路径相对于规格文件）：

```json
{"schemaVersion":1,"productId":"P072","route":"local-blender","archetype":"gerbera","seed":20261014,"stemLengthM":0.65,"headDiameterM":0.12,"headNormal":[0,-0.72,0.69],"petalTexture":"references/ray-floret.png","physicalDimensionsVerified":false,"dimensionBasis":"Breeder reference, not specimen measurement","unverifiedParts":["precise petal count","back-side arrangement"]}
```

```text
blender --background --python <skill>/scripts/build_gerbera.py -- --spec <spec.json> --out <new-version> --samples 16
```

输出 GLB、源文件、整支四视图、花头细节，记录内嵌纹理及 round-trip。已有 stem.glb／source.blend 拒绝覆盖。Blender 可能在 Python 出错后退出码仍为 0，必须确认 manifest 和文件。

其他形态或加工后的 Tripo GLB 使用共同导出：

2026-10-14 的十模型试点新增 `build_botanical.py`：玫瑰杯状螺旋瓣及复叶、康乃馨皱褶瓣及狭叶、百合六片花被与雄蕊、铃兰下垂六裂钟形花、满天星细分枝、银叶桉对生幼叶、黄金球密集球状花序、洋桔梗多头与对生叶。它们有不同的形态生成逻辑；照片中缺失的枝叶数量和背面仍标推测。

先检查新形态的试点，再扩批。可用 `renderResolution`、`detailResolution` 控制预览渲染大小；网页接入需同时提供完整单支正／侧预览，不能用花头图替代编辑器整支预览。

```text
blender --background --python <skill>/scripts/finish_asset.py -- --model <cleaned.glb> --spec <spec.json> --out <new-version>
```

这个脚本不自动修形态、尺度或方向，先在 Blender 加工。Cycles 次表面等不保证等效导出成 glTF，网页需另看。

批量 JSON（路径相对于批次文件）：

```json
{"jobs":[{"spec":"P072/spec.json","out":"P072/v3","samples":16}]}
```

先 `batch_local.py --batch <batch.json> --blender <executable> --dry-run`，再正常运行。相同规格且完整资产可复用，冲突／不完整版本要求新目录，未知形态标需建模器。逐项结果仍需视觉验收。

修改建模器、材质图内容或外观规则时也使用新的规格／输出版本，不因规格 JSON 尚未改变而复用旧结果。材质文件采用新路径，保留旧文件；当前批次缓存键只比较规格文件内容。

## 试点观察

最初轮廓过尖，改成圆端；径向排列仍过规整，不能等同真实育种方图。高灯光使橙色变桃色，降低中性灯光能量后重查。全支图花头小，需要头部正背面细图。AI 全支比例失败，模型用明确米制参数。
