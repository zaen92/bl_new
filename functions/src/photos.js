import {createHash} from 'node:crypto';
import {HttpsError} from 'firebase-functions/v2/https';
import {FieldValue,Timestamp,getStorage} from './admin.js';
import {configFrom} from './ai-config.js';
import {generationId} from './generations.js';
export const photoBucket=()=>getStorage().bucket(process.env.STORAGE_BUCKET || `${process.env.GCLOUD_PROJECT || 'demo-jaeinit'}.appspot.com`);
export function decodePhotos(values,config){
 if(!Array.isArray(values)||values.length<1||values.length>config.maxPhotos)throw new HttpsError('invalid-argument','생성 사진은 최대 10장입니다.');
 let total=0;
 const photos=values.map((src,index)=>{
  if(typeof src!=='string')throw new HttpsError('invalid-argument','사진 형식 오류');
  const m=src.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/);
  if(!m||m[2].length%4!==0)throw new HttpsError('invalid-argument','지원하지 않는 사진입니다.');
  const buffer=Buffer.from(m[2],'base64');
  const mime=m[1];
  const signature=mime==='image/jpeg'?buffer[0]===255&&buffer[1]===216&&buffer[2]===255:mime==='image/png'?buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):buffer.subarray(0,4).toString()==='RIFF'&&buffer.subarray(8,12).toString()==='WEBP';
  if(!signature||buffer.length>config.maxPhotoBytes||buffer.length<12)throw new HttpsError('invalid-argument','사진 파일 또는 크기를 확인하세요.');
  total+=buffer.length;
  return {buffer,mime,index,size:buffer.length,sha256:createHash('sha256').update(buffer).digest('hex')};
 });
 if(total>config.maxUploadBytes)throw new HttpsError('invalid-argument','사진 합계는 6MiB 이하로 업로드하세요.');
 return {photos,total};
}
export async function uploadPhotos(db,bucket,uid,{requestId,photos:values},{now=Date.now()}={}){
 if(typeof requestId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(requestId))throw new HttpsError('invalid-argument','사진 요청 ID 오류');
 const config=configFrom(await db.doc('ops/ai').get());
 const {photos,total}=decodePhotos(values,config),id=generationId(uid,'photos-'+requestId),ref=db.doc(`photoGroups/${id}`);
 const objects=photos.map(p=>({path:`users/${uid}/photos/${id}/${p.index}`,mime:p.mime,size:p.size,sha256:p.sha256}));
 const fingerprint=createHash('sha256').update(JSON.stringify(objects)).digest('hex');
 const existing=await db.runTransaction(async tx=>{
  const [group,user,deleted]=await tx.getAll(ref,db.doc(`users/${uid}`),db.doc(`deletedUsers/${uid}`));
  if(!user.exists||deleted.exists)throw new HttpsError('failed-precondition','사용할 수 없는 회원입니다.');
  if(group.exists){
   if(group.data().fingerprint!==fingerprint)throw new HttpsError('already-exists','사진 요청 ID가 이미 사용됐습니다.');
   if(group.data().status==='ready')return true;
   if(group.data().status!=='deleted')throw new HttpsError('aborted','사진 업로드 처리 중입니다. 잠시 후 상태를 확인하세요.');
  }
  const u=user.data();
  if((u.storageBytes||0)+(u.storageReservedBytes||0)+total>config.storageQuotaBytes)throw new HttpsError('resource-exhausted','회원 사진 저장 용량 200MB를 초과합니다.');
  tx.set(ref,{uid,objects,bytes:total,fingerprint,status:'uploading',retentionDays:config.retentionDays,savedRefs:0,createdAt:FieldValue.serverTimestamp(),expiresAt:Timestamp.fromMillis(now+config.retentionDays*86400000),uploadDeadline:Timestamp.fromMillis(now+300000)});
  tx.update(user.ref,{storageReservedBytes:(u.storageReservedBytes||0)+total});return false;
 });
 if(existing)return {photoGroupId:id,count:photos.length};
 try{
  for(const p of photos){
   if((await db.doc(`deletedUsers/${uid}`).get()).exists)throw new Error('account_deleted');
   await bucket.file(objects[p.index].path).save(p.buffer,{resumable:false,validation:'crc32c',preconditionOpts:{ifGenerationMatch:0},metadata:{contentType:p.mime,cacheControl:'private,no-store'}});
  }
  await db.runTransaction(async tx=>{
   const [g,u,deleted]=await tx.getAll(ref,db.doc(`users/${uid}`),db.doc(`deletedUsers/${uid}`));
   if(deleted.exists||!u.exists||g.data()?.status!=='uploading')throw new Error('upload_cancelled');
   tx.update(ref,{status:'ready',uploadDeadline:FieldValue.delete(),readyAt:FieldValue.serverTimestamp()});
   tx.update(u.ref,{storageBytes:(u.data().storageBytes||0)+total,storageReservedBytes:Math.max(0,(u.data().storageReservedBytes||0)-total)});
  });
 }catch{
  await deletePhotoGroup(db,bucket,id,{force:true}).catch(()=>{});
  throw new HttpsError('unavailable','사진 업로드가 완료되지 않았습니다. 기기 원본은 유지됩니다.');
 }
 return {photoGroupId:id,count:photos.length};
}
export async function loadPhotos(db,bucket,uid,id){
 if(!id)return [];
 const group=await db.doc(`photoGroups/${id}`).get();
 if(!group.exists||group.data().uid!==uid||group.data().status!=='ready')throw new HttpsError('permission-denied','사진 접근 권한이 없습니다.');
 if((await db.doc(`deletedUsers/${uid}`).get()).exists)throw new HttpsError('permission-denied','탈퇴한 계정입니다.');
 return Promise.all(group.data().objects.map(async object=>{
  const file=bucket.file(object.path);const [metadata]=await file.getMetadata();
  if(Number(metadata.size)!==object.size||metadata.metadata?.firebaseStorageDownloadTokens)throw new Error('photo_integrity');
  const [buffer]=await file.download({validation:'crc32c'});
  if(createHash('sha256').update(buffer).digest('hex')!==object.sha256)throw new Error('photo_integrity');
  return {buffer,mime:object.mime};
 }));
}
export async function deletePhotoGroup(db,bucket,id,{force=false,now=Date.now()}={}){
 const ref=db.doc(`photoGroups/${id}`);
 const group=await db.runTransaction(async tx=>{
  const g=await tx.get(ref);if(!g.exists||['deleted'].includes(g.data().status))return null;
  const v=g.data();
  if(!force && ((v.savedRefs||0)>0 || (v.status!=='deleting' && (v.status==='uploading'?v.uploadDeadline?.toMillis():v.expiresAt?.toMillis())>now)))return null;
  // Repeated delete requests are safe; quota is released only once, after deletion.
  tx.update(ref,{status:'deleting'});return {...v,previousStatus:v.status};
 });
 if(!group)return false;
 for(const object of group.objects)await bucket.file(object.path).delete({ignoreNotFound:true});
 await db.runTransaction(async tx=>{
  const [g,u]=await tx.getAll(ref,db.doc(`users/${group.uid}`));
  if(!g.exists||g.data().status==='deleted')return;
  if(u.exists){
   const field=g.data().readyAt?'storageBytes':'storageReservedBytes';
   tx.update(u.ref,{[field]:Math.max(0,(u.data()[field]||0)-g.data().bytes)});
  }
  tx.update(ref,{status:'deleted',objects:[],expiresAt:FieldValue.delete(),uploadDeadline:FieldValue.delete(),deletedAt:FieldValue.serverTimestamp()});
 });
 return true;
}
export async function cleanupPhotos(db,bucket,{now=Date.now(),limit=100}={}){
 const snapshots=await Promise.all([
  db.collection('photoGroups').where('expiresAt','<=',Timestamp.fromMillis(now)).limit(limit).get(),
  db.collection('photoGroups').where('uploadDeadline','<=',Timestamp.fromMillis(now)).limit(limit).get(),
  db.collection('photoGroups').where('status','==','deleting').limit(limit).get()
 ]);
 const groups=new Map(snapshots.flatMap(s=>s.docs).map(g=>[g.id,g]));
 let deleted=0;
 for(const g of groups.values())if(await deletePhotoGroup(db,bucket,g.id,{now}))deleted++;
 return {deleted};
}
export async function deleteUserPhotos(db,bucket,uid){
 await db.doc(`deletedUsers/${uid}`).set({deletedAt:FieldValue.serverTimestamp(),lastSweptAt:Timestamp.fromMillis(0)},{merge:true});
 const groups=await db.collection('photoGroups').where('uid','==',uid).get();
 for(const group of groups.docs)await deletePhotoGroup(db,bucket,group.id,{force:true});
 await bucket.deleteFiles({prefix:`users/${uid}/`});
 const posts=await db.collection('posts').where('uid','==',uid).get();
 for(const post of posts.docs){await db.recursiveDelete(post.ref.collection('photoChunks'));await post.ref.update({photoCount:0,photoGroupId:FieldValue.delete()});}
 await db.doc(`deletedUsers/${uid}`).update({lastSweptAt:FieldValue.serverTimestamp()});
}
