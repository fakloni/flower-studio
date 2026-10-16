"""Build a read-only catalog source audit; does not change published catalog assets."""
from collections import Counter
from hashlib import sha256
from pathlib import Path
import json

BASE = Path(__file__).resolve().parent
REPO = BASE.parents[1]
def read(path):
    return json.loads(path.read_text(encoding='utf-8'))
def save(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
def link(label, path):
    return f'[{label}](<{path.as_posix()}>)'
def cell(value):
    return str(value or '—').replace('|', '／').replace('\n', '；')

catalog = read(REPO / 'data/catalog/catalog.json')
index = read(REPO / 'public/catalog/index.json')
sources = read(BASE / 'sources.json')
new = read(BASE / 'candidates.json')
old_base = REPO / 'artifacts/catalog-media-audit'
old = read(old_base / 'candidates.json')
notes = {
    'enphalaenopsis-cut-manila-lilac-100963-1.jpg': ('flowering-branch-partial', 'Manila 开花枝，多朵花；底部花茎被截断。类别参考，不代表全部蝴蝶兰。'),
    'enphalaenopsis-cut-manila-lilac-100963-0.jpg': ('flower-front-closeup', 'Manila 单花正面，可看唇瓣；没有完整枝条。'),
    'XLENCE.jpg.webp': ('branch-and-flower-inset', 'XLENCE 分枝花序及单花插图，标注10–13 mm；蓝色背景，茎底截断。'),
    'XLENCE-SINGLE-1200x1074.jpg.webp': ('flower-closeup', 'XLENCE 单花微距，可看花瓣；无侧背、枝条与比例尺。'),
    'Xlence-white-background-1097x1200.jpg.webp': ('branched-inflorescence-partial', 'XLENCE 白底分枝花序，适合图鉴；茎底截断。'),
    'Million-Stars.jpg.webp': ('branch-and-flower-inset', 'Million Stars 分枝图及单花插图，标注5 mm；不能当作 Million Stars II。'),
    'DGP_3807-Million-Stars-1200x797.jpg.webp': ('branch-closeup', 'Million Stars 开花枝及花蕾特写；不是完整单支。'),
    'b6ad4f4fb136_hilverdaflorist_dianthus_spray_girona_18_2052.jpg': ('spray-product-partial', 'Girona 多头康乃馨产品图，可能包含多支组合；茎底截断，不能据此确定单支分枝数。'),
    '0a90aa0bc4e1_hilverdaflorist_dianthus_spray_girona_18_2052_flower.jpg': ('flower-front-closeup', 'Girona 单花头正面；类别中的具名品种参考。'),
    '-Eucalyptus_cinerea__2weSiqQsyPPY.jfif': ('leaf-branch-closeup', 'Eucalyptus cinerea 叶枝参考，叶片有遮挡；不对应 Baby Blue。'),
    'monstera-deliciosa-l_jNLlbqthrVY5.jfif': ('leaf-on-potted-plant', 'Monstera deliciosa 盆栽叶片近景；不能代表所有叶龄、叶片尺寸或切叶规格。'),
    '67dc2f421556161c76ece903_Proud1_i39hnz.avif': ('three-stem-product-group', 'Proud 三支白色单头玫瑰组合，非单支多头玫瑰；茎底截断。'),
    '67dc2f421556161c76ece8fa_Proud2_squq7x.avif': ('bud-side-front-closeup', 'Proud 白玫瑰花蕾侧前方、萼片及短段花茎；没有完整单支，不对应菲韵或金辉。'),
}
for item in new:
    filename = Path(item['localPath']).name
    item['viewType'], item['visualReviewNotes'] = notes[filename]
    item['visualReview'] = 'visually-reviewed-candidate'
    item['mappingScope'] = ('named-variety-reference' if item['productIds'][0] in {'P082', 'P083'}
                            else 'species-reference' if item['productIds'][0] in {'P051', 'P067'}
                            else 'category-reference-with-named-variety')
    item['authorizationStatus'] = 'not-assessed'
    if item['productIds'][0] == 'P067':
        item.update(sourceAuthor='Forest and Kim Starr', sourceLicense='CC BY 3.0', authorizationStatus='source-license-recorded')
    elif item['productIds'][0] == 'P051':
        item.update(sourceAuthor='Hope Duckworth', sourceLicense='CC BY 4.0', authorizationStatus='source-license-recorded')
    elif item['productIds'][0] == 'P018':
        item.update(sourceOrganization='Anthura', attributionRequirement='Anthura + variety name', authorizationStatus='source-attribution-terms-recorded')
    else:
        item['sourceOrganization'] = {'P082': 'Danziger', 'P083': 'Danziger', 'P066': 'HilverdaFlorist', 'P052': 'De Ruiter Innovations'}[item['productIds'][0]]
save(BASE / 'candidates.json', new)
for source in sources:
    if source['id'] == 'anthura':
        source['access'] = 'Manila 产品页公开的全尺寸图片已保存两张；照片库批量高清请求另有邮箱／公司表单，本轮未提交'
    elif source['id'] == 'ncsu':
        source['access'] = '旧签名图片链接返回403；刷新源页面取得当前链接后，所选两图已成功保存'
save(BASE / 'sources.json', sources)

photos = [(old_base, x) for x in old] + [(BASE, x) for x in new]
for root, item in photos:
    data = (root / item['localPath']).read_bytes()
    assert len(data) == item['bytes'] and sha256(data).hexdigest() == item['sha256']
photos_by_id = {}
for root, photo in photos:
    for pid in photo['productIds']:
        photos_by_id.setdefault(pid, []).append({
            'localPath': (root / photo['localPath']).relative_to(REPO).as_posix(),
            'sourcePage': photo['sourcePage'], 'width': photo['width'], 'height': photo['height'],
            'viewType': photo.get('viewType'), 'reviewNotes': photo.get('visualReviewNotes'),
            'sameSpecimenMultiView': photo['sameSpecimenMultiView'],
            'publicationStatus': photo['publicationStatus'],
        })
established = {'类别有来源；SKU待核实', '品种资料已核实；国内在售未确认'}
special = {
    'P012': '“掌”未核名；仅在确认红掌后考虑 Anthura，不能直接匹配红掌图。',
    'P054': '先查园艺学报菲韵原论文及附图；不能借用 Proud 等白玫瑰照片。',
    'P055': '先查园艺学报金辉原论文及附图；该条目另含菲韵链接，不应当作金辉图片证据。',
    'P068': 'Baby Blue 条目学名是 E. pulverulenta；现有 PlantNET 链接却指向 E. cinerea，需修正对应；不可复用 P067 图片。',
    'P069': '需先确认桉树物种及幼／成叶；E. cinerea 页面不是本条目的物种确认。',
    'P082': '已取得对应 XLENCE 品种照片；尚不能确认商家 SKU、实物批次或同一标本多视角。',
    'P083': '已取得对应 Million Stars 品种照片；Million Stars II 另属品种，不可自动替换。',
    'P091': '名称来自图片标签；确认物种／切花商品后再选图，不能直接猜作某种蓝色星形花。',
    'P103': '“绿玲草”仅为图片标签；需要原图／供货名称核名，不自动匹配近似名称。',
}
rows = []
for product in catalog['products']:
    pid = product['id']
    direct = [s for s in sources if pid in s['productIds']]
    routes = [{'sourceId': s['id'], 'name': s['name'], 'url': s['url'],
               'scope': s['scope'], 'verification': s['status']} for s in direct]
    for route in routes:
        matching = [p for p in photos_by_id.get(pid, []) if
                    route['url'].split('/')[2] == p['sourcePage'].split('/')[2]]
        if matching:
            route['url'] = matching[0]['sourcePage']
        if route['sourceId'] == 'anthura' and pid == 'P012':
            route['url'] = 'https://anthura.nl/en/photo-library/anthurium-cut-photos/'
        if route['sourceId'] == 'deruiter' and pid == 'P053':
            route['url'] = 'https://www.deruiter.com/'
        if route['sourceId'] == 'vandenbos':
            route['url'] = 'https://www.vandenbos.com/en/' + ('freesia-cut' if pid == 'P048' else 'calla-cut' if pid == 'P081' else 'catalogus-lily')
    if not direct:
        if pid in {'P054', 'P055'}:
            routes.append({'sourceId': 'catalog-original-paper', 'name': '园艺学报原品种论文',
                           'url': product['source']['urls'][0], 'scope': '原品种附图待查', 'verification': '原资料链接已记录，附图尚未取得'})
        else:
            routes.append({'sourceId': 'ppbc', 'name': 'PPBC 中国植物图像库', 'url': 'https://ppbc.iplant.cn/',
                           'scope': '按已确认学名检索；待核名条目先核名', 'verification': '通用检索入口，未逐条确认对应照片'})
    rows.append({'productId': pid, 'name': product['name'], 'group': product['group'],
                 'scientificName': product['scientificName'], 'catalogNameStatus': product['nameStatus'],
                 'identityReviewRequired': product['nameStatus'] not in established,
                 'originalEvidenceUrls': product['source']['urls'], 'recommendedRoutes': routes,
                 'candidatePhotos': photos_by_id.get(pid, []),
                 'selectionNotes': special.get(pid, '需按物种／品种、花型、观赏部位和开放阶段选图；类别参考不证明具体 SKU。')})
assert len(rows) == 104 and len({x['productId'] for x in rows}) == 104
stats = {
    'productRows': len(rows), 'distinctGroupLabels': len({p['group'] for p in catalog['products']}),
    'missingScientificName': sum(not p['scientificName'] for p in catalog['products']),
    'missingSourceUrls': sum(not p['source']['urls'] for p in catalog['products']),
    'noPublishedCover': sum(not p['coverUrl'] for p in index['products']),
    'modelPreviewCover': sum(p['coverKind'] == 'model-preview' for p in index['products']),
    'publishedRealPhotoCover': sum(p['coverKind'] == 'real-photo' for p in index['products']),
    'categoryOrVarietyReferenceEstablished': sum(p['nameStatus'] in established for p in catalog['products']),
    'identityOrCorrespondenceReviewRequired': sum(x['identityReviewRequired'] for x in rows),
    'newCandidatePhotoCount': len(new), 'totalCandidatePhotoCount': len(photos),
    'productsWithCandidatePhotos': len(photos_by_id), 'reviewedSourceProviders': len(sources),
}
save(BASE / 'product-source-map.json', {'checkedDate': '2026-10-14', 'catalogRevision': catalog['revision'], 'stats': stats, 'products': rows})
lines = ['# 104 条花材真实图片来源清单', '', '核查日期：2026-10-14。推荐入口不等于已找到该条目的照片；“需核名”条目先确认商品与物种对应。候选照片均未发布到正式图鉴。', '',
         '| 编号 | 花材 | 名称状态 | 推荐来源 | 已保存候选 | 选图注意 |', '| --- | --- | --- | --- | --- | --- |']
for row in rows:
    routes = '；'.join(f"[{r['name']}]({r['url']})" for r in row['recommendedRoutes'])
    candidates = '；'.join(link(f"图{i+1} {p['width']}×{p['height']}", REPO / p['localPath']) for i, p in enumerate(row['candidatePhotos'])) or '未取得'
    lines.append(f"| {row['productId']} | {cell(row['name'])} | {cell(row['catalogNameStatus'])} | {routes} | {candidates} | {cell(row['selectionNotes'])} |")
(BASE / 'product-source-map.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')

report = ['# 花材库真实图片来源核查', '', '日期：2026-10-14。按当前花材库逐项建立来源路线，并保存小批真实照片样本。', '',
          '## 当前库的情况', '',
          '- 104 条产品记录，76 个分组标签；这是检索／商品类别目录，并非 104 个确定物种。',
          '- 100 条没有封面；另 4 条封面是模型预览。正式图鉴的真实照片封面为 0。',
          '- 31 条缺少学名，20 条没有资料来源链接。',
          '- 按现有名称状态，69 条已有类别或品种资料，仍需核对 SKU；35 条还需核名或确认商品对应。其中 14 条明确待核名／物种，18 条主要来自图片标签，另 3 条只有局部对应资料。',
          '- 上一批 7 张，本次新增 13 张，共 20 张候选照片、覆盖 11 条记录。它们都已视觉检查、保留原始文件及校验值；没有写入正式图鉴。', '',
          '## 如何选择权威来源', '',
          '商业切花优先育种方或专业供应方的具名品种页；叶材、枝果材及物种核对优先植物研究机构、大学和植物园图库。育种方能证明其品种外观，植物机构能提供物种器官参考，二者都不能自动证明商家的 SKU。', '',
          '| 来源 | 对应当前库 | 已核查的图片材料／限制 |', '| --- | --- | --- |']
for s in sources:
    ids = '、'.join(s['productIds']) or '按确认学名检索其他花、叶、枝、果条目'
    report.append(f"| [{s['name']}]({s['url']})（{s['type']}） | {ids} | {cell(s['status'])}；{cell(s['photoTypes'])} |")
report += ['', '## 已保存的真实照片样本', '',
           '以下表格合并上一批与本次候选。同一品种的多张照片不等于同一标本的正侧背视图；尚无一组通过完整同标本多视角验收。', '',
           '| 花材 | 张数 | 可用内容及缺口 |', '| --- | --- | --- |']
by_id = {p['id']: p for p in catalog['products']}
for pid in sorted(photos_by_id):
    ps = photos_by_id[pid]
    report.append(f"| {pid} {by_id[pid]['name']} | {len(ps)} | {'；'.join(cell(p['reviewNotes']) for p in ps)} |")
report += ['', '## 需要先处理的对应问题', '',
           '- P068 Baby Blue 的现有链接混入 Eucalyptus cinerea；不能把 P067 银叶桉的照片配过去。',
           '- P012“掌”、P030“柔丽丝”、P034“天鹅绒”、P091“蓝星花”、P103“绿玲草”等先核名。P069 尤加利还要区分物种和叶龄。',
           '- P054 菲韵、P055 金辉应查原论文附图；不能用 De Ruiter 的 Proud 白玫瑰代替。',
           '- 商品类别可先放具名代表品种，但图注必须写清品种与“类别参考”，例如 P018 的 Manila、P066 的 Girona。', '',
           '## 图鉴和建模的材料要求', '',
           '图鉴优先一张清楚的真实代表图，附品种／物种、器官、摄影来源和对应范围。建模再补完整单支、花头正面、真正侧面、花托背面、茎叶及尺度资料。当前候选大多可做外观参考，但缺茎底、背面或同标本视图；不能称为完整重建素材。', '',
           'Anthura 照片库说明使用时注明 Anthura 和品种名。NC State 本次所选银叶桉图署名 Forest and Kim Starr／CC BY 3.0，龟背叶图署名 Hope Duckworth／CC BY 4.0；该站其他图片许可不同。其余来源逐图记录使用条件，保留“本地候选”状态。', '',
           '## 文件', '',
           f"- {link('104 条逐项清单', BASE / 'product-source-map.md')}",
           f"- {link('结构化对应清单与统计', BASE / 'product-source-map.json')}",
           f"- {link('15 个来源的核查记录', BASE / 'sources.json')}",
           f"- {link('本次 13 张图片的来源、尺寸、校验值、逐图意见', BASE / 'candidates.json')}",
           f"- {link('上一批 7 张图片', old_base / 'README.md')}", '',
           '建议采集顺序：先补已确认品种及成熟来源（非洲菊、满天星、康乃馨、蝴蝶兰、玫瑰、菊花、洋桔梗），再按学名补叶枝果材；35 条对应不清的条目先核名后选图。']
(BASE / 'README.md').write_text('\n'.join(report) + '\n', encoding='utf-8')
print(json.dumps(stats, ensure_ascii=False, indent=2))
print('Verified all candidate hashes and all 104 unique product records.')
