import { parseDesign, type Design } from '@/modules/design/model';

export type SavedWork = { id: string; design: Design; updatedAt: number };
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open('flowerstudio-local',1);
    request.onupgradeneeded=()=>request.result.createObjectStore('works',{keyPath:'id'});
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error);
    request.onblocked=()=>reject(new Error('本机存储正在被其他窗口更新，请关闭旧页面后重试'));
  });
}
async function writeWork(design: Design) {
  const database=await openDatabase();
  try { await new Promise<void>((resolve,reject)=>{
    const transaction=database.transaction('works','readwrite');
    transaction.objectStore('works').put({id:design.id,design:parseDesign(design),updatedAt:Date.now()});
    transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error);
  }); } finally { database.close(); }
}
let saveQueue:Promise<void>=Promise.resolve();
export function saveWork(design:Design) {
  const snapshot=parseDesign(design);
  const request=saveQueue.catch(()=>{}).then(()=>writeWork(snapshot));
  saveQueue=request;return request;
}
export async function listWorks(): Promise<SavedWork[]> {
  const database=await openDatabase();
  try { return await new Promise((resolve,reject)=>{
    const request=database.transaction('works','readonly').objectStore('works').getAll();
    request.onsuccess=()=>{
      const valid:SavedWork[]=[];
      for(const item of request.result){try{const design=parseDesign(item.design);if(typeof item.updatedAt==='number'&&Number.isFinite(item.updatedAt))valid.push({...item,design});}catch{/* An invalid record must not block other recoverable drafts. */}}
      resolve(valid.sort((a,b)=>b.updatedAt-a.updatedAt));
    };request.onerror=()=>reject(request.error);
  }); } finally { database.close(); }
}
export async function deleteWork(id:string) {
  const database=await openDatabase();
  try { await new Promise<void>((resolve,reject)=>{
    const transaction=database.transaction('works','readwrite');transaction.objectStore('works').delete(id);
    transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);
  }); } finally { database.close(); }
}
