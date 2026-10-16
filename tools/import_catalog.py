"""Import a reference workbook into versioned local catalog files (Python stdlib only)."""

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
from urllib.parse import unquote, urlsplit
from xml.etree import ElementTree as ET
from zipfile import ZipFile

MAIN = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
REL = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"
PRODUCT_ID = re.compile(r"P\d{3,}")
REFERENCE_SHEETS = {"花材库", "名称映射", "尺寸证据", "图片核对"}
ROLES = {
    "主花": "主花", "配花": "配花", "叶材": "叶材", "线条材": "线条", "线条花": "线条",
    "垂坠线条材": "线条", "造型花": "造型", "造型材": "造型", "体量花": "体量",
    "填充花": "填充", "填充材": "填充", "点缀花": "点缀", "质感材": "质感",
    "草材": "草材", "花枝": "枝材", "枝材": "枝材", "藤枝材": "枝材", "果材": "果材",
    "配材": "配材", "骨架花": "骨架",
}
ALLOWED_OVERRIDES = {"name", "roles", "roleNotes", "roleStatus", "notes"}


def normalized_header(value):
    return re.sub(r"\s+", "", str(value or ""))


def read_workbook(path):
    """Read sparse cells by coordinates, including shared and rich inline strings."""
    result = {}
    with ZipFile(path) as archive:
        strings = []
        if "xl/sharedStrings.xml" in archive.namelist():
            for item in ET.fromstring(archive.read("xl/sharedStrings.xml")):
                strings.append("".join(t.text or "" for t in item.iter(MAIN + "t")))
        relationships = {
            r.attrib["Id"]: r.attrib["Target"]
            for r in ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        }
        sheets = ET.fromstring(archive.read("xl/workbook.xml")).find(MAIN + "sheets")
        for sheet in sheets:
            if sheet.attrib["name"] not in REFERENCE_SHEETS:
                continue
            target = relationships[sheet.attrib[REL + "id"]]
            location = target.lstrip("/") if target.startswith("/") else "xl/" + target
            cells = {}
            for cell in ET.fromstring(archive.read(location)).iter(MAIN + "c"):
                value = cell.find(MAIN + "v")
                if cell.find(MAIN + "f") is not None:
                    raise ValueError(f"工作表 {sheet.attrib['name']} 有公式单元格 {cell.attrib['r']}，请先核实静态导入值")
                kind = cell.attrib.get("t")
                if kind == "inlineStr":
                    parsed = "".join(t.text or "" for t in cell.iter(MAIN + "t"))
                elif value is None or value.text is None:
                    continue
                elif kind == "s":
                    parsed = strings[int(value.text)]
                elif kind in {"str", "e"}:
                    parsed = value.text
                elif kind == "b":
                    parsed = value.text == "1"
                else:
                    numeric = float(value.text)
                    parsed = int(numeric) if numeric.is_integer() else numeric
                cells[cell.attrib["r"]] = parsed if parsed != "" else None
            result[sheet.attrib["name"]] = cells
    return result


def table(cells, required_headers):
    headers = {}
    for address, value in cells.items():
        match = re.fullmatch(r"([A-Z]+)1", address)
        if match and value is not None:
            headers[normalized_header(value)] = match[1]
    missing = set(map(normalized_header, required_headers)) - headers.keys()
    if missing:
        raise ValueError("缺少字段：" + "、".join(sorted(missing)))
    row_numbers = sorted({int(re.search(r"\d+$", a).group()) for a in cells} - {1})
    return [(row, {h: cells.get(f"{col}{row}") for h, col in headers.items()}) for row in row_numbers]


def get(row, header):
    return row.get(normalized_header(header))


def lines(value):
    return [part.strip() for part in str(value or "").splitlines() if part.strip()]


def reference(name, urls):
    return {"name": name, "urls": [u for u in lines(urls) if urlsplit(u).scheme in {"https", "http"}]}


def roles_from_text(text):
    raw = str(text or "")
    conditional = any(marker in raw for marker in ["待", "暂定", "若"])
    # A conditional identity must not silently become a confirmed role tag.
    tags = [] if conditional else list(dict.fromkeys(ROLES[p.strip()] for p in re.split(r"[；;/]", raw) if p.strip() in ROLES))
    return {"tags": tags, "raw": text, "status": "pending" if conditional else "project-suggestion"}


def month_intervals(text):
    """Normalize only unambiguous month descriptions; never infer stock or missing months."""
    if not text:
        return None
    raw = str(text).strip()
    cleaned = re.sub(r"（[^）]*）", "", raw)
    interval = re.fullmatch(r"(\d{1,2})月?(?:上旬|中旬|下旬)?(?:至|[–—\-])(?:翌年)?(\d{1,2})月(?:上旬|中旬|下旬)?", cleaned)
    single = re.fullmatch(r"(\d{1,2})月(?:上旬|中旬|下旬)?", cleaned)
    if interval:
        start, end = map(int, interval.groups())
        if 1 <= start <= 12 and 1 <= end <= 12:
            return [{"start": start, "end": end, "wrapsYear": end < start, "precision": "month-reference"}]
    if single and 1 <= int(single.group(1)) <= 12:
        month = int(single.group(1))
        return [{"start": month, "end": month, "wrapsYear": False, "precision": "month-reference"}]
    return None


def validate_overrides(overrides, ids):
    if overrides.get("schemaVersion") != 1 or not isinstance(overrides.get("products"), dict):
        raise ValueError("人工补充文件格式不正确")
    for product_id, values in overrides["products"].items():
        if product_id not in ids:
            raise ValueError(f"人工补充指向不存在的产品 {product_id}，请保留该产品或明确处理冲突")
        if not isinstance(values, dict) or set(values) - ALLOWED_OVERRIDES:
            raise ValueError(f"人工补充 {product_id} 含不支持的字段")
        if "name" in values and (not isinstance(values["name"], str) or not values["name"].strip()):
            raise ValueError(f"人工名称不能为空：{product_id}")
        if "roles" in values and (not isinstance(values["roles"], list) or any(r not in set(ROLES.values()) for r in values["roles"])):
            raise ValueError(f"人工角色标签不正确：{product_id}")
        if "roleStatus" in values and values["roleStatus"] not in {"pending", "project-suggestion", "reviewed"}:
            raise ValueError(f"人工角色状态不正确：{product_id}")
        for field in ["notes", "roleNotes"]:
            if field in values and not isinstance(values[field], (str, type(None))):
                raise ValueError(f"人工备注字段不正确：{product_id}/{field}")


def validate_assets(registry, ids, root):
    if registry.get("schemaVersion") != 1 or not isinstance(registry.get("assets"), list):
        raise ValueError("素材清单格式不正确")
    seen, editor_ids = set(), set()
    for asset in registry["assets"]:
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]+", asset.get("id", "")) or asset["id"] in seen:
            raise ValueError("素材 ID 缺失或重复")
        seen.add(asset["id"])
        if not isinstance(asset.get("version"), int) or asset["version"] < 1:
            raise ValueError(f"素材版本不正确：{asset['id']}")
        if asset.get("productId") is not None and asset["productId"] not in ids:
            raise ValueError(f"素材指向不存在的产品：{asset['id']}")
        if asset.get("kind") not in {"model-preview", "photo"} or asset.get("publicationStatus") not in {"pending", "local-reference", "approved"}:
            raise ValueError(f"素材种类或发布状态不正确：{asset['id']}")
        if asset["kind"] == "photo" and asset["publicationStatus"] == "approved" and not all(asset.get(k) for k in ["sourceUrl", "author", "license"]):
            raise ValueError(f"已发布照片缺少来源、作者或许可记录：{asset['id']}")
        editor = asset.get("editor")
        urls = [asset.get("coverUrl")]
        if editor:
            if editor.get("id") in editor_ids or not editor.get("id"):
                raise ValueError("编辑器花材 ID 缺失或重复")
            editor_ids.add(editor["id"])
            urls.extend(editor.get(k) for k in ["model", "image", "sideImage", "thumb"])
        for url in urls:
            if not isinstance(url, str) or not url:
                raise ValueError(f"素材缺少文件引用：{asset['id']}")
            parsed = urlsplit(url)
            if parsed.scheme == "https" and parsed.netloc:
                continue
            path = unquote(parsed.path)
            if parsed.scheme or parsed.netloc or not path.startswith("/assets/") or "\\" in path or ".." in PurePosixPath(path).parts:
                raise ValueError(f"素材路径不合法：{url}")
            file = (root / "public" / path.lstrip("/")).resolve()
            if not file.is_relative_to((root / "public" / "assets").resolve()) or not file.is_file():
                raise ValueError(f"素材文件不存在：{url}")


def build_catalog(sheets, overrides, registry, root):
    required_sheets = REFERENCE_SHEETS
    if required_sheets - sheets.keys():
        raise ValueError("缺少工作表：" + "、".join(sorted(required_sheets - sheets.keys())))
    products = []
    for row_number, row in table(sheets["花材库"], ["产品ID", "花材ID", "原始／新增名称", "大类", "小类", "花材角色（项目建议）", "核实花季／果季", "季节数据口径", "季节适用地区／对象"]):
        product_id = get(row, "产品ID")
        if not isinstance(product_id, str) or not PRODUCT_ID.fullmatch(product_id):
            raise ValueError(f"花材库第 {row_number} 行产品 ID 不正确")
        name = get(row, "原始／新增名称")
        if not isinstance(name, str) or not name.strip():
            raise ValueError(f"花材库第 {row_number} 行名称为空")
        roles = roles_from_text(get(row, "花材角色（项目建议）"))
        season_text = get(row, "核实花季／果季")
        products.append({
            "id": product_id, "flowerId": get(row, "花材ID"), "name": name,
            "group": get(row, "大类"), "subgroup": get(row, "小类"),
            "scientificName": get(row, "学名／分类范围"), "nameStatus": get(row, "名称核对状态"),
            "roles": roles["tags"], "roleStatus": roles["status"], "roleNotes": roles["raw"],
            "shapeNotes": get(row, "形态标签（项目建议）"), "ornamentalPart": get(row, "观赏部位"),
            "season": {"text": season_text, "basis": get(row, "季节数据口径"), "region": get(row, "季节适用地区／对象"),
                       "intervals": month_intervals(season_text), "status": "reference" if season_text else "unknown",
                       "source": reference(get(row, "季节来源名称"), get(row, "季节来源URL")),
                       "unverifiedOriginal": get(row, "用户原始月份（未验证）")},
            "dimensions": {"object": get(row, "花头尺寸对象"), "minCm": get(row, "直径下限cm"), "maxCm": get(row, "直径上限cm"),
                           "valueType": get(row, "数值类型"), "scope": get(row, "尺寸适用物种／品种"),
                           "notes": get(row, "其他尺寸及数量摘要"), "source": reference(get(row, "花头尺寸来源"), get(row, "花头尺寸来源URL"))},
            "notes": get(row, "缺失信息／项目注意事项"), "source": reference(get(row, "名称／资料来源"), get(row, "名称／资料来源URL")),
            "checkedDate": get(row, "核查日期"), "availability": {"status": "unknown", "region": None},
            "sourceRecord": {"sheet": "花材库", "row": row_number, "values": row},
            "aliases": [], "imageReferences": [], "assets": [],
        })
    ids = {p["id"] for p in products}
    if len(ids) != len(products):
        raise ValueError("产品 ID 重复，未发布本次导入")
    validate_overrides(overrides, ids)
    validate_assets(registry, ids, root)
    product_map = {p["id"]: p for p in products}
    mappings = []
    for row_number, row in table(sheets["名称映射"], ["输入名称／标签", "目标产品ID", "关系类型"]):
        product_id = get(row, "目标产品ID")
        if product_id not in ids:
            raise ValueError(f"名称映射第 {row_number} 行指向不存在的产品")
        alias = {"name": get(row, "输入名称／标签"), "productId": product_id, "relation": get(row, "关系类型"),
                 "restriction": get(row, "判断限制"), "status": get(row, "核对状态"),
                 "source": reference(get(row, "依据来源"), get(row, "依据URL"))}
        product_map[product_id]["aliases"].append(alias)
        mappings.append(alias)
    evidence = [{"id": get(row, "证据ID"), "flowerId": get(row, "花材ID"), "values": row}
                for _, row in table(sheets["尺寸证据"], ["证据ID", "花材ID", "测量项目", "适用物种／品种／商品", "来源URL"])]
    image_refs = []
    for row_number, row in table(sheets["图片核对"], ["图片标签", "图片文件", "对应产品ID"]):
        target_ids = [v.strip() for v in re.split(r"[；;\n]", str(get(row, "对应产品ID") or "")) if v.strip()]
        if not target_ids or any(v not in ids for v in target_ids):
            raise ValueError(f"图片核对第 {row_number} 行产品关联不正确")
        entry = {"label": get(row, "图片标签"), "files": lines(get(row, "图片文件")), "productIds": target_ids,
                 "notes": get(row, "核对说明"), "seasonRestriction": get(row, "季节口径限制"), "status": "reference-only"}
        image_refs.append(entry)
        for product_id in target_ids:
            product_map[product_id]["imageReferences"].append(entry)
    assets = []
    for original in registry["assets"]:
        asset = copy_asset_with_checksums(original, root)
        assets.append(asset)
        if asset.get("productId") and asset["publicationStatus"] != "pending":
            product_map[asset["productId"]]["assets"].append(asset)
    for product_id, values in overrides["products"].items():
        product_map[product_id].update(values)
        product_map[product_id]["curation"] = values
    return {"schemaVersion": 1, "scope": "general-reference", "assets": assets, "products": sorted(products, key=lambda p: p["id"]),
            "nameMappings": mappings, "dimensionEvidence": evidence, "imageReferences": image_refs}


def copy_asset_with_checksums(asset, root):
    urls = [asset["coverUrl"]]
    if asset.get("editor"):
        urls.extend(asset["editor"][key] for key in ["model", "image", "sideImage", "thumb"])
    files = []
    for url in dict.fromkeys(urls):
        parsed = urlsplit(url)
        if parsed.scheme == "https":
            files.append({"url": url, "sha256": None, "bytes": None})
        else:
            data = (root / "public" / unquote(parsed.path).lstrip("/")).read_bytes()
            files.append({"url": url, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data)})
    return {**asset, "files": files}


def encoded(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n").encode("utf-8")


def write_if_changed(path, content):
    if path.is_file() and path.read_bytes() == content:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_bytes(content)
    os.replace(temporary, path)


def publish(source, root, preview=False):
    base = root / "data/catalog"
    overrides = json.loads((base / "overrides.json").read_text(encoding="utf-8-sig"))
    registry = json.loads((base / "assets.json").read_text(encoding="utf-8-sig"))
    catalog = build_catalog(read_workbook(source), overrides, registry, root)
    source_hash = hashlib.sha256(source.read_bytes()).hexdigest()
    payload = {**catalog, "sourceFile": source.name, "sourceSha256": source_hash}
    revision = hashlib.sha256(encoded(payload)).hexdigest()[:20]
    catalog = {**payload, "revision": revision}
    previous_path = base / "catalog.json"
    previous = json.loads(previous_path.read_text(encoding="utf-8")) if previous_path.exists() else {"products": []}
    old = {p["id"]: p for p in previous["products"]}
    new = {p["id"]: p for p in catalog["products"]}
    old_assets = {a["id"]: a for a in previous.get("assets", [a for p in old.values() for a in p["assets"]])}
    for asset in catalog["assets"]:
        earlier = old_assets.get(asset["id"])
        if earlier and any(earlier.get(k) != asset.get(k) for k in ["version", "productId", "variantId", "kind", "coverUrl", "editor"]):
            raise ValueError(f"已发布素材 {asset['id']} 的内容引用发生变化，请新增素材 ID 和版本，保留旧文件")
        if earlier and "files" in earlier and earlier["files"] != asset["files"]:
            raise ValueError(f"已发布素材 {asset['id']} 的文件内容发生变化，请新增素材 ID、版本和文件路径")
    removed = sorted(old.keys() - new.keys())
    # Existing designs or manual notes may still refer to an omitted product.
    if removed:
        raise ValueError("本次导入缺少已有产品，未发布。请显式处理停用或迁移：" + "、".join(removed))
    original_files = sorted({file for r in catalog["imageReferences"] for file in r["files"]})
    known_names = {p.name for folder in ["flower-pic-samples", "asset-sources", "artifacts", "public/assets"]
                   for p in (root / folder).rglob("*") if p.is_file()}
    report = {
        "schemaVersion": 1, "revision": revision, "sourceFile": source.name, "sourceSha256": source_hash,
        "counts": {"products": len(new), "aliases": len(catalog["nameMappings"]), "dimensionEvidence": len(catalog["dimensionEvidence"]),
                   "imageLabels": len(catalog["imageReferences"]), "seasonUnknown": sum(p["season"]["status"] == "unknown" for p in new.values()),
                   "withPreview": sum(bool(p["assets"]) for p in new.values()), "rolePending": sum(p["roleStatus"] == "pending" for p in new.values())},
        "changes": {"added": sorted(new.keys() - old.keys()), "updated": sorted(k for k in new.keys() & old.keys() if new[k] != old[k]), "removed": removed},
        "missingImageFiles": [f for f in original_files if f not in known_names],
        "unmatchedEditorAssets": [a["id"] for a in registry["assets"] if a.get("editor") and a.get("productId") is None],
        "photoMissing": sorted(p["id"] for p in new.values() if not any(a["kind"] == "photo" for a in p["assets"])),
        "seasonNeedsInterpretation": sorted(p["id"] for p in new.values() if p["season"]["text"] and p["season"]["intervals"] is None),
    }
    if preview:
        return report
    release_url = f"/catalog/releases/{revision}"
    index_products = []
    for product in catalog["products"]:
        detail = {**product, "schemaVersion": 1, "revision": revision}
        # Retain evidence as a reference pool, never infer that it applies to every subcategory/SKU.
        detail["relatedEvidence"] = [e for e in catalog["dimensionEvidence"] if e["flowerId"] and e["flowerId"] == product["flowerId"]]
        write_if_changed(root / f"public{release_url}/products/{product['id']}.json", encoded(detail))
        index_products.append({
            "id": product["id"], "name": product["name"], "group": product["group"], "subgroup": product["subgroup"],
            "roles": product["roles"], "roleStatus": product["roleStatus"], "nameStatus": product["nameStatus"],
            "searchNames": list(dict.fromkeys([product["name"], product["group"], product["subgroup"]] + [a["name"] for a in product["aliases"] if a["name"]])),
            "seasonStatus": product["season"]["status"], "coverUrl": product["assets"][0]["coverUrl"] if product["assets"] else None,
            "coverKind": product["assets"][0]["kind"] if product["assets"] else None,
            "editorIds": [a["editor"]["id"] for a in product["assets"] if a.get("editor")],
            "detailUrl": f"{release_url}/products/{product['id']}.json",
        })
    snapshot_report = base / f"snapshots/{revision}/import-report.json"
    batch_report = json.loads(snapshot_report.read_text(encoding="utf-8")) if snapshot_report.exists() else report
    write_if_changed(base / f"snapshots/{revision}/catalog.json", encoded(catalog))
    write_if_changed(snapshot_report, encoded(batch_report))
    write_if_changed(base / f"sources/{source_hash}.xlsx", source.read_bytes())
    write_if_changed(base / "catalog.json", encoded(catalog))
    write_if_changed(base / "import-report.json", encoded(batch_report))
    # The public index is switched last, after all immutable detail files are available.
    index_content = encoded({"schemaVersion": 1, "revision": revision, "scope": "general-reference",
                             "counts": report["counts"], "products": index_products})
    write_if_changed(root / f"public{release_url}/index.json", index_content)
    write_if_changed(root / "public/catalog/index.json", index_content)
    return report


def main():
    parser = argparse.ArgumentParser(description="校验并导入花材参考 Excel，保留人工补充和旧版本")
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--source", type=Path)
    parser.add_argument("--preview", action="store_true", help="仅校验和预览，不写文件")
    args = parser.parse_args()
    root = args.root.resolve()
    source = args.source or root / "花材数据库_产品细分与名称匹配v3.xlsx"
    try:
        report = publish(source.resolve(), root, args.preview)
        print(json.dumps({"mode": "preview" if args.preview else "published-local", "revision": report["revision"],
                          "counts": report["counts"], "changes": {k: len(v) for k, v in report["changes"].items()},
                          "missingImageFiles": len(report["missingImageFiles"]), "photoMissing": len(report["photoMissing"]),
                          "unmatchedEditorAssets": report["unmatchedEditorAssets"]}, ensure_ascii=False))
    except (ValueError, KeyError, OSError, ET.ParseError) as error:
        print(f"花材库导入失败：{error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
