export type RoleStatus = 'pending' | 'project-suggestion' | 'reviewed';
export type Source = { name: string | null; urls: string[] };
export type CatalogSummary = {
  id: string; name: string; group: string; subgroup: string; roles: string[]; roleStatus: RoleStatus;
  nameStatus: string; searchNames: string[]; seasonStatus: 'reference' | 'unknown';
  coverUrl: string | null; coverKind: 'model-preview' | 'photo' | null; editorIds: string[]; detailUrl: string;
};
export type CatalogIndex = {
  schemaVersion: 1; revision: string; scope: 'general-reference'; products: CatalogSummary[];
  counts: { products: number; aliases: number; dimensionEvidence: number; imageLabels: number; seasonUnknown: number; withPreview: number; rolePending: number };
};
export type CatalogAsset = {
  id: string; version: number; productId: string | null; variantId: string; kind: 'model-preview' | 'photo';
  coverUrl: string; notes?: string; sourceUrl?: string; author?: string; license?: string;
  publicationStatus?: 'pending' | 'local-reference' | 'approved'; mappingStatus?: string;
  editor?: { id: string; name: string; color: string };
};
export type CatalogProduct = {
  schemaVersion: 1; revision: string; id: string; flowerId: string | null; name: string; group: string; subgroup: string;
  scientificName: string | null; nameStatus: string; roles: string[]; roleStatus: RoleStatus; roleNotes: string | null;
  shapeNotes: string | null; ornamentalPart: string | null; notes: string | null; checkedDate: string | null; source: Source;
  season: { text: string | null; basis: string | null; region: string | null; intervals: Array<{ start: number; end: number; wrapsYear: boolean }> | null; status: 'reference' | 'unknown'; source: Source; unverifiedOriginal: string | null };
  dimensions: { object: string | null; minCm: number | null; maxCm: number | null; valueType: string | null; scope: string | null; notes: string | null; source: Source };
  aliases: Array<{ name: string; relation: string; restriction: string | null; status: string | null }>;
  assets: CatalogAsset[];
  relatedEvidence: Array<{ id: string; flowerId: string; values: Record<string, string | number | null> }>;
  availability: { status: 'unknown'; region: null };
};

export type CatalogFilter = { search: string; role: string; group: string; media: string };
export function filterCatalog(products: CatalogSummary[], filter: CatalogFilter): CatalogSummary[] {
  const query = filter.search.trim().toLocaleLowerCase('zh-CN');
  return products.filter(product =>
    (!query || [product.id, ...product.searchNames].some(name => name.toLocaleLowerCase('zh-CN').includes(query))) &&
    (filter.role === '全部' || (filter.role === '待核定' ? product.roleStatus === 'pending' : product.roles.includes(filter.role))) &&
    (filter.group === '全部' || product.group === filter.group) &&
    (filter.media === 'all' || (filter.media === 'editor' ? product.editorIds.length > 0 : product.coverUrl === null))
  );
}

let indexRequest: Promise<CatalogIndex> | null = null;
const details = new Map<string, Promise<CatalogProduct>>();
async function readJson(url: string, fresh = false): Promise<unknown> {
  const response = await fetch(url, { cache: fresh ? 'no-store' : 'default' });
  if (!response.ok) throw new Error('图鉴暂时无法载入，请重试。');
  return response.json();
}
export function loadCatalogIndex(): Promise<CatalogIndex> {
  // Share only in-flight requests; opening the catalog again checks the published index.
  if (!indexRequest) indexRequest = readJson('/catalog/index.json', true).then(input => {
    const value = input as CatalogIndex;
    if (value?.schemaVersion !== 1 || value.scope !== 'general-reference' || !/^[a-f0-9]{20}$/.test(value.revision) || !Array.isArray(value.products)) throw new Error('图鉴资料格式不正确，请重新导入。');
    for (const product of value.products) {
      if (!/^P\d{3,}$/.test(product.id) || product.detailUrl !== `/catalog/releases/${value.revision}/products/${product.id}.json` || !Array.isArray(product.searchNames)) throw new Error('图鉴目录关联不正确，请重新导入。');
    }
    return value;
  }).finally(() => { indexRequest = null; });
  return indexRequest;
}
export function loadCatalogProduct(product: CatalogSummary, revision: string): Promise<CatalogProduct> {
  const url = product.detailUrl;
  if (!details.has(url)) {
    const request = readJson(url).then(input => {
      const value = input as CatalogProduct;
      if (value?.schemaVersion !== 1 || value.id !== product.id || value.revision !== revision) throw new Error('花材详情与当前目录不一致，请重新打开图鉴。');
      return value;
    }).catch(error => { details.delete(url); throw error; });
    details.set(url, request);
  }
  return details.get(url)!;
}
