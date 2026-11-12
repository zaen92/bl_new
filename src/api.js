import { httpsCallable } from 'firebase/functions';
import { collection, query, where, orderBy, limit, onSnapshot, doc } from 'firebase/firestore';
import { functions, db, auth } from './firebase.js';
const call = async (name, payload) => {
  if (!auth.currentUser) throw new Error('로그인이 필요합니다.');
  return (await httpsCallable(functions, name)(payload)).data;
};
export const ensureProfile = () => call('ensureProfile', {});
export async function generate(payload,onProgress=()=>{}){
 if(!auth.currentUser)throw new Error('로그인이 필요합니다.');
 const response=await httpsCallable(functions,'requestGeneration').stream(payload);
 for await(const chunk of response.stream)onProgress(chunk);
 return response.data;
}
export const uploadPhotos = payload => call('uploadGenerationPhotos',payload);
export const getGeneration = generationId => call('getGeneration',{generationId});
export const updateBlogStyle = style => call('updateBlogStyle',style);
export function watchGenerations(uid,onHistory,onError){
 return onSnapshot(query(collection(db,'generations'),where('uid','==',uid),orderBy('createdAt','desc'),limit(50)),
  snapshot=>onHistory(snapshot.docs.map(d=>({...d.data(),id:d.id}))),onError);
}
export async function saveCloudPost(payload){
 const uid=auth.currentUser?.uid;if(!uid)throw new Error('로그인이 필요합니다.');
 const data={...payload,post:{...payload.post}};
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(data.post.imgs||[])));
 const photoDigest=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
 if(data.post.ownerUid===uid&&data.post.generationId&&data.post.generationPhotoDigest===photoDigest){
  data.generationId=data.post.generationId;data.post.imgs=[];
 }else if(data.post.imgs?.length){
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(data.id+'-'+data.requestId));
  const requestId=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  data.photoGroupId=(await uploadPhotos({requestId,photos:data.post.imgs})).photoGroupId;
  data.post.imgs=[];
 }
 return call('savePost',data);
}
export const loadCloudPost = id => call('getPost', {id});
export function watchMember(uid, onProfile, onPosts, onError) {
  const stopProfile = onSnapshot(doc(db, 'users', uid), s => onProfile(s.data()), onError);
  const stopPosts = onSnapshot(query(collection(db, 'posts'), where('uid','==',uid), orderBy('updatedAt','desc'), limit(100)),
    s => onPosts(s.docs.map(d => ({...d.data(), id:d.id}))), onError);
  return () => { stopProfile(); stopPosts(); };
}
