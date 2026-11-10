import { httpsCallable } from 'firebase/functions';
import { collection, query, where, orderBy, limit, onSnapshot, doc } from 'firebase/firestore';
import { functions, db, auth } from './firebase.js';
const call = async (name, payload) => {
  if (!auth.currentUser) throw new Error('로그인이 필요합니다.');
  return (await httpsCallable(functions, name)(payload)).data;
};
export const ensureProfile = () => call('ensureProfile', {});
export const generate = payload => call('requestGeneration', payload);
export const saveCloudPost = payload => call('savePost', payload);
export const loadCloudPost = id => call('getPost', {id});
export function watchMember(uid, onProfile, onPosts, onError) {
  const stopProfile = onSnapshot(doc(db, 'users', uid), s => onProfile(s.data()), onError);
  const stopPosts = onSnapshot(query(collection(db, 'posts'), where('uid','==',uid), orderBy('updatedAt','desc'), limit(100)),
    s => onPosts(s.docs.map(d => ({...d.data(), id:d.id}))), onError);
  return () => { stopProfile(); stopPosts(); };
}
