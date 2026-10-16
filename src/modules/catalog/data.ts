import assetRegistry from '../../../data/catalog/assets.json';

export type FlowerId = 'pink-rose' | 'white-tulip' | 'eucalyptus' | 'red-rose' | 'sunflower' | 'spider-lily'
  | 'gerbera-atlanta' | 'gerbera-annecy' | 'white-rose-proud' | 'carnation-green-shot'
  | 'oriental-lily-colet' | 'lily-of-valley' | 'gypsophila-xlence' | 'silver-eucalyptus'
  | 'craspedia-yellow' | 'lisianthus-piccolo';
export type VaseId = 'ivory-bud' | 'sage-fluted';
export type Flower = { id: FlowerId; name: string; color: string; role: '主花' | '配花' | '叶材'; model: string; image: string; sideImage: string; thumb: string; height: number; isPilot?: boolean };
const sample = '/assets/sample-pack/';
// The asset registry owns existing editor IDs and file versions; saved works keep these IDs.
export const flowers: Flower[] = assetRegistry.assets.flatMap(asset => asset.editor ? [{
  ...asset.editor, id: asset.editor.id as FlowerId, role: asset.editor.role as Flower['role'],
}] : []);
export const flowerMap = Object.fromEntries(flowers.map(flower => [flower.id, flower])) as Record<FlowerId, Flower>;
export const vases = [
  { id: 'ivory-bud' as VaseId, name: '奶油白细口瓶', height: 23.2, mouth: 4.2, model: sample+'ivory-bud.glb', image: sample+'ivory-bud-front.webp', sideImage: sample+'ivory-bud-side.webp' },
  { id: 'sage-fluted' as VaseId, name: '鼠尾草绿竖纹瓶', height: 26.2, mouth: 9.8, model: sample+'sage-fluted.glb', image: sample+'sage-fluted-front.webp', sideImage: sample+'sage-fluted-side.webp' },
];
export const templates = [
  { name: '春日·粉白花意', description: '粉玫瑰与白郁金香，搭配轻盈叶材。', counts: { 'pink-rose': 3, 'white-tulip': 2, eucalyptus: 3 } },
  { name: '清晨·白与绿', description: '以白色花朵和灰绿叶材为主。', counts: { 'white-tulip': 5, eucalyptus: 3 } },
  { name: '向阳·暖色花意', description: '明亮向日葵，点缀温柔粉玫瑰。', counts: { sunflower: 2, 'pink-rose': 3, eucalyptus: 2 } },
  { name: '新花材·白绿花意', description: '白玫瑰、洋桔梗与满天星，搭配银叶桉。', counts: { 'white-rose-proud': 2, 'lisianthus-piccolo': 1, 'gypsophila-xlence': 1, 'silver-eucalyptus': 2 } },
  { name: '新花材·橙黄花意', description: '橙色非洲菊与黄金球，点缀浅绿康乃馨。', counts: { 'gerbera-atlanta': 2, 'craspedia-yellow': 3, 'carnation-green-shot': 2, 'silver-eucalyptus': 2 } },
];
