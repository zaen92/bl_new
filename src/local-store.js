import {textDocument} from './text-document.js';
import {approveJSONExport} from './api.js';
import {auth} from './firebase.js';
const database = new Promise((resolve, reject) => {
  const req = indexedDB.open('jaeinit-studio', 2);
  req.onupgradeneeded = () => {
    for(const name of ['posts','textPosts'])if(!req.result.objectStoreNames.contains(name))req.result.createObjectStore(name,{keyPath:'id'});
    for(const name of ['drafts','textDrafts'])if(!req.result.objectStoreNames.contains(name))req.result.createObjectStore(name);
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
async function transact(store, mode, operation) {
  const db = await database;
  return new Promise((resolve, reject) => {
    store=store==='posts'?'textPosts':store==='drafts'?'textDrafts':store;
    const tx = db.transaction(store, mode);
    const request = operation(tx.objectStore(store));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('기기 저장에 실패했습니다.'));
  });
}
export const localPosts = async() => (await transact('posts','readonly', s => s.getAll())).map(p=>({...textDocument(p),id:p.id,cloudLinks:p.cloudLinks||{}}));
export const putLocalPost = p => transact('posts','readwrite', s => s.put({...textDocument(p),id:p.id,cloudLinks:p.cloudLinks||{}}));
export const deleteLocalPost = id => transact('posts','readwrite', s => s.delete(id));
export const getDraft = async() => {const p=await transact('drafts','readonly', s => s.get('current'));return p?textDocument(p):null;};
export const putDraft = draft => transact('drafts','readwrite', s => s.put(textDocument(draft), 'current'));
async function migrateDeviceText(){
 if(await transact('drafts','readonly',s=>s.get('deviceTextMigrated')))return;
 const db=await database;
 const raw=(store,operation)=>new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly'),r=operation(tx.objectStore(store));r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 const oldPosts=await raw('posts',s=>s.getAll()),oldDraft=await raw('drafts',s=>s.get('current'));
 const cleaned=oldPosts.map(p=>({...textDocument(p),id:p.id,cloudLinks:p.cloudLinks||{}})),draft=oldDraft?textDocument(oldDraft):null;
 const existing=new Set((await localPosts()).map(p=>p.id)),current=await getDraft();
 await new Promise((resolve,reject)=>{const tx=db.transaction(['textPosts','textDrafts'],'readwrite');for(const p of cleaned)if(!existing.has(p.id))tx.objectStore('textPosts').put(p);if(draft&&!current)tx.objectStore('textDrafts').put(draft,'current');tx.objectStore('textDrafts').put(true,'deviceTextMigrated');tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
 // The v1 stores, including original images, are never rewritten or deleted.
}
export async function migrateLegacy() {
  await migrateDeviceText();
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
 if(!auth.currentUser)throw new Error('로그인 후 JSON 내보내기를 이용하세요.');
 const backup={schemaVersion:3,posts:(await localPosts()).map(textDocument),draft:(await getDraft())};
 const json=JSON.stringify(backup);if(json.length>50*1024*1024)throw new Error('JSON 파일이 너무 큽니다.');
 // Validate the complete, image-free file before asking the server for approval.
 JSON.parse(json);const blob=new Blob([json],{type:'application/json'});
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(json)))].map(b=>b.toString(16).padStart(2,'0')).join('');
 const key='jaeinit_export_pending_'+auth.currentUser.uid;
 let pending;try{pending=JSON.parse(localStorage.getItem(key)||'null');}catch{}
 if(!pending||pending.digest!==digest||pending.bytes!==blob.size){pending={requestId:crypto.randomUUID(),digest,bytes:blob.size};localStorage.setItem(key,JSON.stringify(pending));}
 await approveJSONExport(pending);
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='jaeinit-backup.json';
 try{a.click();localStorage.removeItem(key);}finally{setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
export async function importBackup(raw) {
 if(raw.length>50*1024*1024)throw new Error('백업 파일은 최대 50MiB입니다.');
 const parsed=JSON.parse(raw),posts=Array.isArray(parsed)?parsed:parsed?.posts;
 if(!Array.isArray(posts)||posts.length>10000)throw new Error('posts 배열이 포함된 JSON을 선택하세요.');
 const entries=[...posts];if(parsed.draft)entries.push({...parsed.draft,title:'백업에서 복원한 작성 중 글'});
 // Images and every unknown field in legacy JSON are ignored, never restored.
 const cleaned=entries.map(textDocument);
 const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)))].map(b=>b.toString(16).padStart(2,'0')).join('');
 const db=await database;
 await new Promise((resolve,reject)=>{const tx=db.transaction('textPosts','readwrite'),store=tx.objectStore('textPosts');cleaned.forEach((p,i)=>store.put({...p,id:'import_'+digest+'_'+i,cloudLinks:{}}));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
 return entries.length;
}
