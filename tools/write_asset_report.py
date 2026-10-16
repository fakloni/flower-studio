import json
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/asset-library'
flowers=json.loads((ROOT/'asset-sources/flowers/collection.json').read_text(encoding='utf-8'))
vases=json.loads((ROOT/'public/assets/vases/catalog.json').read_text(encoding='utf-8'))
prepared=json.loads((ROOT/'public/assets/flowers/catalog.json').read_text(encoding='utf-8'))
labels={'Astilbe White Rose':'落新妇候选','Dahlia flowers':'大丽花','Eucalyptus Bouquet Vase':'尤加利','Flower Sunflower Medium':'向日葵','Hydrangea  light yellow':'浅黄绣球','Red rose flower':'红玫瑰','Red Spider Lily':'红花石蒜','Roses in Twisted Glass Vase':'粉玫瑰','SJ-Mystic Garden Serenity Fern':'观赏花穗与蕨叶','Tulips':'紫橙郁金香','Tulips in a pot':'白郁金香','Yellow Flower':'黄色花材（品种待确认）'}
def link(path): return (ROOT/path).as_posix()
lines=['# FlowerStudio 第一批素材库','','日期：2026-10-12','','本轮已下载 12 组花材模型，原始模型文件约 618 MiB；全部通过 Blender 导入检查，未发现缺失贴图。另建成 8 款原创花瓶，并整理 7 个可继续加工的花材样本。全部保留源文件，尚未接入正式编辑器。','','## 原创花瓶','','![原创花瓶预览]('+link('artifacts/asset-library/vases-overview.jpg')+')','','花瓶均包含瓶口、内壁与底部，使用米为模型单位。尺寸是本轮构造模型的尺寸，不对应已经采购的实物商品。每款提供透明 PNG、GLB 和可编辑 Blender 源文件。','','| 花瓶 | 高度 / 内口径 | 3D 模型 | 透明图片 | 源文件 |','| --- | --- | --- | --- | --- |']
for v in vases:
    dim=v['dimensions']
    lines.append(f"| {v['name']} | {dim['height_cm']} / {dim['mouth_inner_diameter_cm']} cm | [GLB]({link('public'+v['model'])}) | [PNG]({link('public'+v['preview'])}) | [Blender]({link(v['source'])}) |")
lines+=['','## 已获取花材','','![来源预览]('+link('artifacts/asset-library/flowers-overview.jpg')+')','','上图为来源页面预览，用于比较候选外观；下图为本机 Blender 实际渲染。12 组指不同模型包，不代表 12 种已经验收的单支花材。花种名称主要依来源描述，未确认的品种保留待确认标记。','','| 花材 | 原模型名称 | 原始文件 | 来源 |','| --- | --- | --- | --- |']
for f in flowers:
    blends=[file for file in f['downloaded'] if file['type']=='blend']
    file=blends[0] if blends else f['downloaded'][0]
    lines.append(f"| {labels.get(f['name'],f['name'])} | {f['name']} | [下载到本机的模型]({link(file['path'])}) | [来源页面]({f['source_url']}) |")
lines+=['','## 已整理的花材样本','','![实际渲染]('+link('artifacts/asset-library/flowers-prepared.jpg')+')','','7 个样本已输出透明 PNG 和 GLB：红玫瑰、红花石蒜、向日葵、黄色花材、白郁金香、粉玫瑰双支以及尤加利组合。','','| 样本 | 3D 模型 | 透明图片 | 单支状态 |','| --- | --- | --- | --- |']
for f in prepared:
    state='组合，待拆分' if f['logical_stems'] is None else ('双支组合' if f['logical_stems']==2 else '单支候选')
    lines.append(f"| {f['name']} | [GLB]({link('public'+f['model'])}) | [PNG]({link('public'+f['preview'])}) | {state} |")
lines+=['','## 当前筛选判断','','- 粉玫瑰的花瓣表现较好，可优先用于组合效果验证。白郁金香和尤加利可继续优化姿态与材质。','- 大丽花、浅黄绣球和落新妇候选保留完整高细节原模型，适合继续筛选和拆分。绣球模型包含额外对象，不能按整包包围盒直接缩放。','- 红玫瑰花型偏硬；向日葵几何较轻，叶片和侧面表现有限。先作为交互与性能候选，不作为最终写实质量标准。','- 黄色花材的具体品种尚未确认；观赏花穗与蕨叶也需核实品种。','- 满天星候选主要是装饰球，不适合逐支插花，本轮未纳入下载集合。康乃馨、芍药与洋牡丹尚未取得满意的可下载候选。','','花材样本为方便比较统一到 50 cm 的展示高度。此数值是预览规范，不是经确认的花茎真实规格；正式插花比例和采购数量映射仍需校准。','','## 验证与下一步','','- 原始文件：12 组模型导入成功，无缺失贴图。','- 导出文件：结构检查与 Blender 再导入结果见 [验证记录]('+link('artifacts/asset-library/validation.json')+')。','- 已检查透明渲染图，并修正向日葵等样本的展示视角。','- 浏览器材质和手机性能尚未验证；通过文件再导入不等于已经完成网页运行验收。','','下一步优先用粉玫瑰、白郁金香和尤加利，搭配细口瓶与宽口瓶制作组合样片；随后拆分高细节花材，明确一支花对应的几何对象和数量。']
(OUT/'README.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
print(OUT/'README.md')
