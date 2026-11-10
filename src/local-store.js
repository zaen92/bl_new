const database = new Promise((resolve, reject) => {
  const req = indexedDB.open('jaeinit-studio', 1);
  req.onupgradeneeded = () => {
    req.result.createObjectStore('posts', {keyPath:'id'});
    req.result.createObjectStore('drafts');
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
async function transact(store, mode, operation) {
  const db = await database;
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const request = operation(tx.objectStore(store));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('기기 저장에 실패했습니다.'));
  });
}
export const localPosts = () => transact('posts','readonly', s => s.getAll());
export const putLocalPost = p => transact('posts','readwrite', s => s.put(p));
export const deleteLocalPost = id => transact('posts','readwrite', s => s.delete(id));
export const getDraft = () => transact('drafts','readonly', s => s.get('current'));
export const putDraft = draft => transact('drafts','readwrite', s => s.put(draft, 'current'));
export async function migrateLegacy() {
  // Never delete or rewrite the original. Invalid JSON remains available in backup.
  const raw = localStorage.getItem('jaeinit_saved_posts');
  if (!raw) return;
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw)))].map(b=>b.toString(16).padStart(2,'0')).join('');
  if(await transact('drafts','readonly', s=>s.get('migratedLegacy')) === digest)return;
  let posts;
  try { posts = JSON.parse(raw); } catch { throw new Error('기존 글 데이터 형식을 읽을 수 없습니다. JSON 백업을 내려받으세요. 원본은 유지됩니다.'); }
  if (!Array.isArray(posts)) throw new Error('기존 글 데이터가 배열이 아닙니다. 원본은 유지됩니다.');
  const saved = new Set((await localPosts()).map(p => p.id));
  for (const [index, post] of posts.entries()) {
    const id = `legacy_${index}_${post.id}`;
    if (!saved.has(id)) await putLocalPost({...post, id, legacyOriginal:post, imgs:post.imgs || [], schemaVersion:1});
  }
  await transact('drafts','readwrite', s=>s.put(digest,'migratedLegacy'));
}
export async function exportBackup() {
  const backup = {schemaVersion:1, exportedAt:new Date().toISOString(), posts:await localPosts(),
    draft:await getDraft(), legacyRaw:localStorage.getItem('jaeinit_saved_posts')};
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup)], {type:'application/json'}));
  const a = document.createElement('a'); a.href=url; a.download='jaeinit-backup.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importBackup(raw) {
  if(raw.length>50*1024*1024)throw new Error('백업 파일은 최대 50MiB입니다. 원본은 변경되지 않았습니다.');
  const parsed=JSON.parse(raw);
  const posts=Array.isArray(parsed)?parsed:parsed.posts;
  if(!Array.isArray(posts))throw new Error('posts 배열이 포함된 JSON 백업을 선택하세요.');
  const entries=[...posts];
  if(parsed.draft)entries.push({...parsed.draft,title:'백업에서 복원한 작성 중 글'});
  for(const p of entries){
    if(!p || typeof p!=='object' || (p.data && (typeof p.data!=='object' || typeof p.data.body!=='string')) ||
      (p.imgs && (!Array.isArray(p.imgs) || p.imgs.some(src=>typeof src!=='string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(src)))))
      throw new Error('지원하지 않는 글/사진 데이터입니다. 파일과 기존 보관함은 유지됩니다.');
  }
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(b=>b.toString(16).padStart(2,'0')).join('');
  // All records in one transaction: a failed import never leaves a partial backup.
  const db=await database;
  await new Promise((resolve,reject)=>{
    const tx=db.transaction('posts','readwrite');const store=tx.objectStore('posts');
    entries.forEach((p,index)=>store.put({...p,id:'import_'+digest+'_'+index,cloudLinks:{}}));
    tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
  return entries.length;
}
