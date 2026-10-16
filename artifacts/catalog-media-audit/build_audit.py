"""Build a review queue from the current catalog and inspected candidate files."""
from pathlib import Path
from hashlib import sha256
import json

ROOT = Path(__file__).parent
PROJECT = ROOT.parent.parent
index = json.loads((PROJECT / 'public/catalog/index.json').read_text(encoding='utf-8'))
catalog = json.loads((PROJECT / 'data/catalog/catalog.json').read_text(encoding='utf-8'))
candidates = json.loads((ROOT / 'candidates.json').read_text(encoding='utf-8'))
priority = {'P001','P007','P014','P017','P021','P045','P047','P050','P051','P056','P057','P065','P067','P070','P080','P101'}
reviews = {
    'img-GREENBALL-PLANO-GENERAL.jpg': ('侧前方单支参考，茎底端被画面截断。', 'single-stem-partial'),
    'img-GRENNBALL-PLANO-MEDIO-.jpg': ('与全景图方向基本相同，主要是取景距离变化，不算独立侧视图。', 'same-angle-medium'),
    'img-GREENBALL-PRIMER-PLANO.jpg': ('花头俯视特写；可辅助辨认质感，不作为 Tripo 的正侧背输入。', 'head-closeup'),
    '20ce6f3f337e_hilverdaflorist_standard_carnation_green_shot_4_2.jpg': ('Green Shot 花头环境特写；无完整茎叶，与白底图无法确认同一标本。', 'head-closeup'),
    '0a90aa0bc4e1_greenshot_01.jpg': ('Green Shot 白底花头正面；仅代表单头康乃馨中的一个绿色品种。', 'head-front'),
    '0a90aa0bc4e1_atlanta_01.jpg': ('Atlanta 橙色花头正面；对应 P072，缺少侧背及完整花茎。', 'head-front'),
    '0a90aa0bc4e1_hilverdaflorist_gerbera_mini_annecy.jpg': ('Annecy 白色花头正面；对应 P073，缺少侧背及完整花茎。', 'head-front'),
}
for item in candidates:
    if item.get('error'):
        continue
    path = ROOT / item['localPath']
    assert path.is_file()
    assert sha256(path.read_bytes()).hexdigest() == item['sha256']
    item['visualReviewNotes'], item['viewType'] = reviews[path.name]
    item['reviewStatus'] = 'visually-reviewed-candidate'
(ROOT / 'candidates.json').write_text(json.dumps(candidates, ensure_ascii=False, indent=2), encoding='utf-8')

rows = []
details = {p['id']: p for p in catalog['products']}
for product in index['products']:
    detail = details[product['id']]
    ambiguous = any(s in product['nameStatus'] for s in ('待核名', '待核物种'))
    photos = [p for p in candidates if product['id'] in p['productIds'] and not p.get('error')]
    assets = [a for a in catalog['assets'] if a.get('productId') == product['id']]
    row = {
        'productId': product['id'], 'name': product['name'], 'scientificName': detail.get('scientificName'),
        'nameStatus': product['nameStatus'], 'currentCoverUrl': product['coverUrl'],
        'currentCoverKind': product['coverKind'], 'missingCover': product['coverUrl'] is None,
        'priority': 'identity-first' if ambiguous else ('first-batch' if product['id'] in priority else 'later-batch'),
        'existingEvidencePages': detail['source']['urls'],
        'evidencePagesAreNotVerifiedImageSources': True,
        'privatePhotoCandidates': [p['localPath'] for p in photos],
        'photoCandidateSourcePages': list(dict.fromkeys(p['sourcePage'] for p in photos)),
        'sameSpecimenModelInputReady': False,
        'editorVariants': [{'id': a['editor']['id'], 'distinctFrontAndSide': a['editor']['image'].split('?')[0] != a['editor']['sideImage'].split('?')[0]} for a in assets if a.get('editor')],
        'nextAction': '先核对实物／商家标签与学名，再找图' if ambiguous else ('补齐同标本侧背和整支；候选图未发布' if photos else '按现有证据页及产品形态定向寻找真实照片'),
    }
    rows.append(row)
assert len(rows) == 104 and len({r['productId'] for r in rows}) == 104
assert sum(r['missingCover'] for r in rows) == 100
assert len(candidates) == 7 and len({r['productIds'][0] for r in candidates}) == 4
(ROOT / 'audit.json').write_text(json.dumps({'date': '2026-10-14', 'catalogRevision': index['revision'], 'products': rows}, ensure_ascii=False, indent=2), encoding='utf-8')
lines = ['# 花材缺图采集清单', '', '核查日期：2026-10-14。根据当前发布目录逐项整理，100 项缺封面；4 项现有封面均为模型预览。以下来源链接来自原资料，是下一步采集入口，未全部核实含有合适图片。新找到的候选图单列，未改变网站或原始 Excel。', '', '## 采集顺序', '', '第一批 16 项：乒乓菊、鲜切绣球、绿毛球、银莲花、芍药、花毛茛、金鱼草、补血草、龟背叶、单瓣／重瓣洋桔梗、单头康乃馨、银叶桉、标准非洲菊、白花马蹄莲、六出花。另优先补 Atlanta 和 Annecy 的精确品种照片。', '', '待核名项先核对实物和标签，避免把名称猜测变成错误配图。13 个缺封面项处于待核名状态；已有预览的 P069 也待核物种。', '', '## 100 个缺封面产品', '', '| 编号 | 花材 | 顺序 | 本轮本地候选 | 原资料采集入口 |', '| --- | --- | --- | --- | --- |']
for row in rows:
    if not row['missingCover']:
        continue
    source = row['existingEvidencePages']
    links = '、'.join(f'[来源{i+1}]({url})' for i, url in enumerate(source)) or '来源待补'
    order = {'identity-first':'先核名','first-batch':'第一批','later-batch':'后续'}[row['priority']]
    found = f"{len(row['privatePhotoCandidates'])} 张已检查候选" if row['privatePhotoCandidates'] else '待采集'
    lines.append(f"| {row['productId']} | {row['name']} | {order} | {found} | {links} |")
lines += ['', '## 已有模型预览的 4 项', '', '| 编号 | 花材 | 编辑示例正侧图是否不同 |', '| --- | --- | --- |']
for row in rows:
    if not row['missingCover']:
        variants = '；'.join(f"{v['id']}：{'不同' if v['distinctFrontAndSide'] else '相同图'}" for v in row['editorVariants'])
        lines.append(f"| {row['productId']} | {row['name']} | {variants} |")
(ROOT / 'missing-images.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
print(json.dumps({'catalogRevision': index['revision'], 'products': len(rows), 'missingCover': sum(r['missingCover'] for r in rows), 'savedCandidateImages': len(candidates), 'candidateProducts': 4, 'missingIdentityPending': sum(r['missingCover'] and r['priority']=='identity-first' for r in rows)}, ensure_ascii=False))
