import copy
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

PROJECT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("catalog_import", PROJECT / "tools/import_catalog.py")
IMPORTER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(IMPORTER)
SOURCE = PROJECT / "花材数据库_产品细分与名称匹配v3.xlsx"


class CatalogImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sheets = IMPORTER.read_workbook(SOURCE)
        cls.registry = json.loads((PROJECT / "data/catalog/assets.json").read_text(encoding="utf-8"))

    def test_source_counts_identity_and_unverified_season_are_preserved(self):
        catalog = IMPORTER.build_catalog(self.sheets, {"schemaVersion": 1, "products": {}}, self.registry, PROJECT)
        self.assertEqual(len(catalog["products"]), 104)
        self.assertEqual(len(catalog["nameMappings"]), 135)
        self.assertEqual(len(catalog["dimensionEvidence"]), 70)
        self.assertEqual(len(catalog["imageReferences"]), 76)
        self.assertEqual(sum(p["season"]["status"] == "unknown" for p in catalog["products"]), 52)
        self.assertTrue(all(p["availability"]["status"] == "unknown" for p in catalog["products"]))
        self.assertEqual(sum(p["flowerId"] is None for p in catalog["products"]), 20)
        ambiguous = next(r for r in catalog["imageReferences"] if len(r["productIds"]) > 1)
        self.assertGreater(len(ambiguous["productIds"]), 1)

    def test_cross_year_months_and_ambiguous_descriptions(self):
        self.assertEqual(IMPORTER.month_intervals("9月至翌年3月"), [{"start": 9, "end": 3, "wrapsYear": True, "precision": "month-reference"}])
        self.assertEqual(IMPORTER.month_intervals("3月下旬–5月下旬")[0]["end"], 5)
        self.assertIsNone(IMPORTER.month_intervals("果期5–11月；花期3–6月"))
        self.assertIsNone(IMPORTER.month_intervals("春节前后"))
        self.assertIsNone(IMPORTER.month_intervals("13–14月"))
        self.assertIsNone(IMPORTER.month_intervals(None))

    def test_roles_do_not_promote_conditional_identity_to_fact(self):
        self.assertEqual(IMPORTER.roles_from_text("主花；配花")["tags"], ["主花", "配花"])
        self.assertEqual(IMPORTER.roles_from_text("待确认；若红掌可作主花/造型花")["tags"], [])
        self.assertEqual(IMPORTER.roles_from_text("待核定")["status"], "pending")

    def test_manual_fields_survive_missing_source_values(self):
        sheets = copy.deepcopy(self.sheets)
        sheets["花材库"]["G2"] = None
        sheets["花材库"]["T2"] = None
        overrides = {"schemaVersion": 1, "products": {"P001": {"roles": ["主花"], "roleStatus": "reviewed", "notes": "人工核对备注"}}}
        product = IMPORTER.build_catalog(sheets, overrides, self.registry, PROJECT)["products"][0]
        self.assertEqual(product["roles"], ["主花"])
        self.assertEqual(product["roleStatus"], "reviewed")
        self.assertEqual(product["notes"], "人工核对备注")
        self.assertIsNone(product["sourceRecord"]["values"]["缺失信息／项目注意事项"])

    def test_duplicate_ids_and_dangling_relations_fail(self):
        duplicate = copy.deepcopy(self.sheets)
        duplicate["花材库"]["AD3"] = duplicate["花材库"]["AD2"]
        with self.assertRaisesRegex(ValueError, "重复"):
            IMPORTER.build_catalog(duplicate, {"schemaVersion": 1, "products": {}}, self.registry, PROJECT)
        broken = copy.deepcopy(self.sheets)
        broken["名称映射"]["B2"] = "P999"
        with self.assertRaisesRegex(ValueError, "不存在"):
            IMPORTER.build_catalog(broken, {"schemaVersion": 1, "products": {}}, self.registry, PROJECT)

    def test_asset_path_and_unknown_override_are_rejected(self):
        registry = copy.deepcopy(self.registry)
        registry["assets"][0]["coverUrl"] = "/assets/%2e%2e/package.json"
        with self.assertRaisesRegex(ValueError, "路径"):
            IMPORTER.validate_assets(registry, {asset['productId'] for asset in registry['assets'] if asset.get('productId')}, PROJECT)
        with self.assertRaisesRegex(ValueError, "不存在"):
            IMPORTER.validate_overrides({"schemaVersion": 1, "products": {"P999": {"notes": "manual"}}}, {"P001"})

    def prepare_root(self, root):
        base = root / "data/catalog"
        base.mkdir(parents=True)
        (base / "assets.json").write_text(json.dumps(self.registry), encoding="utf-8")
        (base / "overrides.json").write_text('{"schemaVersion":1,"products":{}}', encoding="utf-8")
        for asset in self.registry["assets"]:
            for url in [asset["coverUrl"], *[asset["editor"][k] for k in ["model", "image", "sideImage", "thumb"] if asset.get("editor")]]:
                path = root / "public" / url.split("?")[0].lstrip("/")
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"fixture")

    def test_preview_repeat_import_and_versioned_update(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.prepare_root(root)
            before_preview = {p: p.read_bytes() for p in root.rglob("*") if p.is_file()}
            IMPORTER.publish(SOURCE, root, preview=True)
            self.assertEqual(before_preview, {p: p.read_bytes() for p in root.rglob("*") if p.is_file()})
            first = IMPORTER.publish(SOURCE, root)
            files = {p: (p.read_bytes(), p.stat().st_mtime_ns) for p in root.rglob("*") if p.is_file()}
            repeated = IMPORTER.publish(SOURCE, root)
            self.assertEqual(first["revision"], repeated["revision"])
            self.assertEqual(repeated["changes"], {"added": [], "updated": [], "removed": []})
            self.assertEqual(files, {p: (p.read_bytes(), p.stat().st_mtime_ns) for p in root.rglob("*") if p.is_file()})
            override_path = root / "data/catalog/overrides.json"
            override_path.write_text(json.dumps({"schemaVersion": 1, "products": {"P001": {"notes": "new manual note"}}}), encoding="utf-8")
            updated = IMPORTER.publish(SOURCE, root)
            self.assertNotEqual(first["revision"], updated["revision"])
            old_detail = root / f"public/catalog/releases/{first['revision']}/products/P001.json"
            self.assertEqual(files[old_detail][0], old_detail.read_bytes())
            index = json.loads((root / "public/catalog/index.json").read_text(encoding="utf-8"))
            self.assertEqual(index["revision"], updated["revision"])
            self.assertEqual(len(index["products"]), 104)
            self.assertEqual(updated["changes"]["updated"], ["P001"])

    def test_failed_import_leaves_published_index_and_details_untouched(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.prepare_root(root)
            IMPORTER.publish(SOURCE, root)
            previous = {p: p.read_bytes() for p in (root / "public/catalog").rglob("*.json")}
            broken = copy.deepcopy(self.sheets)
            broken["花材库"]["AD3"] = "P001"
            with patch.object(IMPORTER, "read_workbook", return_value=broken):
                with self.assertRaises(ValueError):
                    IMPORTER.publish(SOURCE, root)
            self.assertEqual(previous, {p: p.read_bytes() for p in (root / "public/catalog").rglob("*.json")})

    def test_removal_and_in_place_asset_changes_do_not_publish(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.prepare_root(root)
            IMPORTER.publish(SOURCE, root)
            index_bytes = (root / "public/catalog/index.json").read_bytes()
            path = root / "data/catalog/catalog.json"
            saved = json.loads(path.read_text(encoding="utf-8"))
            saved["products"].append({"id": "P999", "assets": []})
            path.write_text(json.dumps(saved), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "缺少已有产品"):
                IMPORTER.publish(SOURCE, root)
            saved["products"].pop()
            path.write_text(json.dumps(saved), encoding="utf-8")
            registry = copy.deepcopy(self.registry)
            registry["assets"][0]["coverUrl"] = registry["assets"][3]["coverUrl"]
            (root / "data/catalog/assets.json").write_text(json.dumps(registry), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "新增素材 ID"):
                IMPORTER.publish(SOURCE, root)
            self.assertEqual(index_bytes, (root / "public/catalog/index.json").read_bytes())


    def test_asset_bytes_cannot_be_overwritten_under_an_existing_version(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.prepare_root(root)
            IMPORTER.publish(SOURCE, root)
            index = (root / "public/catalog/index.json").read_bytes()
            url = self.registry["assets"][0]["coverUrl"]
            (root / "public" / url.split("?")[0].lstrip("/")).write_bytes(b"changed image")
            with self.assertRaisesRegex(ValueError, "文件内容发生变化"):
                IMPORTER.publish(SOURCE, root)
            self.assertEqual(index, (root / "public/catalog/index.json").read_bytes())


if __name__ == "__main__":
    unittest.main()
