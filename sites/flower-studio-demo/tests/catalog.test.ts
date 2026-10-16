import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flowers } from '../src/modules/catalog/data';
import { filterCatalog, type CatalogIndex, type CatalogProduct } from '../src/modules/catalog/library';
import { createDesign, parseDesign } from '../src/modules/design/model';

const index = JSON.parse(readFileSync('public/catalog/index.json', 'utf8')) as CatalogIndex;
function detail(id: string): CatalogProduct {
  const product = index.products.find(p => p.id === id)!;
  return JSON.parse(readFileSync(`public${product.detailUrl}`, 'utf8'));
}
test('published catalog details belong to the same complete revision', () => {
  assert.equal(index.products.length, 104);
  assert.equal(new Set(index.products.map(p => p.id)).size, 104);
  for (const product of index.products) {
    const value = detail(product.id);
    assert.equal(value.id, product.id);
    assert.equal(value.revision, index.revision);
    assert.equal(value.availability.status, 'unknown');
  }
});
test('alias search preserves product identity and supports multi-role filters', () => {
  const filter = { search: '独轮菊', role: '全部', group: '全部', media: 'all' };
  assert.ok(filterCatalog(index.products, filter).some(p => p.id === 'P003'));
  const primary = filterCatalog(index.products, { ...filter, search: '', role: '主花' });
  const supporting = filterCatalog(index.products, { ...filter, search: '', role: '配花' });
  assert.ok(primary.some(p => p.id === 'P001'));
  assert.ok(supporting.some(p => p.id === 'P001'));
  assert.equal(filterCatalog(index.products, { ...filter, search: '不存在的花材' }).length, 0);
  assert.equal(filterCatalog(index.products, { ...filter, search: '', media: 'editor' }).length, 13);
});
test('candidate identity, missing data, and broad evidence remain distinct', () => {
  const candidate = detail('P084');
  assert.equal(candidate.flowerId, null);
  assert.equal(candidate.season.status, 'unknown');
  assert.equal(candidate.season.intervals, null);
  const uncertainRole = detail('P012');
  assert.equal(uncertainRole.roleStatus, 'pending');
  assert.deepEqual(uncertainRole.roles, []);
  const rose = detail('P052');
  assert.equal(rose.assets[0].kind, 'photo');
  assert.ok(rose.assets.some(asset => asset.kind === 'model-preview'));
  assert.ok(rose.relatedEvidence.length > 0);
});
test('existing six editor IDs and saved designs retain compatibility', () => {
  assert.deepEqual(flowers.filter(flower => !flower.isPilot).map(flower => flower.id), ['pink-rose', 'white-tulip', 'eucalyptus', 'red-rose', 'sunflower', 'spider-lily']);
  for (const product of index.products) for (const id of product.editorIds) assert.ok(flowers.some(flower => flower.id === id));
  const design = createDesign('旧作品', { 'pink-rose': 2, 'white-tulip': 1, 'spider-lily': 1 });
  assert.deepEqual(parseDesign(JSON.parse(JSON.stringify(design))), design);
});

test('ten new models have distinct registered IDs and survive saved-design round trips', () => {
  const pilots = flowers.filter(flower => flower.isPilot);
  assert.equal(pilots.length, 10);
  assert.equal(new Set(pilots.map(flower => flower.model)).size, 10);
  const design = createDesign('十种新花材', Object.fromEntries(pilots.map(flower => [flower.id, 1])));
  assert.deepEqual(parseDesign(JSON.parse(JSON.stringify(design))), design);
  for (const flower of pilots) {
    const product = index.products.find(p => p.editorIds.includes(flower.id));
    assert.ok(product, `${flower.name} is missing from the catalog`);
    assert.equal(product.coverKind, 'photo');
    const asset = detail(product.id).assets.find(a => a.editor?.id === flower.id);
    assert.equal(asset?.kind, 'model-preview');
    assert.notEqual(flower.image, flower.sideImage);
  }
});
