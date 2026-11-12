import { httpsCallable } from 'firebase/functions';
import { collection, query, where, orderBy, limit, onSnapshot, doc } from 'firebase/firestore';
import {textDocument} from './text-document.js';
import { functions, db, auth } from './firebase.js';
const call = async (name, payload) => {
  if (!auth.currentUser) throw new Error('로그인이 필요합니다.');
  return (await httpsCallable(functions, name)(payload)).data;
};
export const ensureProfile = () => call('ensureProfile', {});
export async function generate(payload,onProgress=()=>{}){
 if(!auth.currentUser)throw new Error('로그인이 필요합니다.');
 const response=await httpsCallable(functions,'requestGeneration',{timeout:360000}).stream(payload);
 for await(const chunk of response.stream)onProgress(chunk);
 return response.data;
}
export const approveJSONExport=payload=>call('approveJSONExport',payload);
export const servicePolicy=()=>call('getServicePolicy',{});
export const listCloudPosts=payload=>call('listPosts',payload);
export const deleteCloudPost=payload=>call('deletePost',payload);
export const getBlogStyles=()=>call('getBlogStyles',{});
export const selectBlogStyle=id=>call('selectBlogStyle',{id});
export const deleteBlogStyle=id=>call('deleteBlogStyle',{id});
export const getGeneration = generationId => call('getGeneration',{generationId});
export const updateBlogStyle = style => call('updateBlogStyle',style);
export function watchGenerations(uid,onHistory,onError){
 return onSnapshot(query(collection(db,'generations'),where('uid','==',uid),orderBy('createdAt','desc'),limit(50)),
  snapshot=>onHistory(snapshot.docs.map(d=>({...d.data(),id:d.id}))),onError);
}
export const saveCloudPost=payload=>call('savePost',{...payload,post:textDocument(payload.post)});
export const loadCloudPost = id => call('getPost', {id});
export function watchMember(uid, onProfile, onPosts, onError) {
  const stopProfile = onSnapshot(doc(db, 'users', uid), s => onProfile(s.data()), onError);
  const stopPosts = onSnapshot(query(collection(db, 'posts'), where('uid','==',uid), orderBy('updatedAt','desc'), limit(20)),
    s => onPosts(s.docs.map(d => ({...d.data(), id:d.id}))), onError);
  return () => { stopProfile(); stopPosts(); };
}
