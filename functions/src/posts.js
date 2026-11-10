import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
const fail = message => { throw new HttpsError('invalid-argument', message); };
const idPattern = /^[A-Za-z0-9_-]{1,100}$/;
const resultFields = ['title_1','title_2','title_3','keyword_main','keyword_sub','keyword_location','keyword_intent','place_name','place_address','place_hours','place_price','body','reel','thumbnail'];
const text = (value, max = 20000) => {
  if (typeof value !== 'string' || value.length > max) fail('잘못된 글 데이터입니다.');
  return value;
};
export function validatePost(input) {
  if (!input || typeof input.id !== 'string' || typeof input.requestId !== 'string' || !idPattern.test(input.id) || !idPattern.test(input.requestId)) fail('잘못된 요청 ID입니다.');
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0 || input.expectedVersion > 1000000000) fail('버전이 필요합니다.');
  const p = input.post;
  if (!p || !p.data || typeof p.data !== 'object') fail('본문이 필요합니다.');
  const data = {};
  for (const field of resultFields) data[field] = text(p.data[field] ?? '', field === 'body' ? 60000 : 10000);
  if (!Array.isArray(p.data.hashtags) || p.data.hashtags.length > 50) fail('태그가 올바르지 않습니다.');
  data.hashtags = p.data.hashtags.map(tag => text(tag, 200));
  const photos = p.imgs ?? [];
  if (!Array.isArray(photos) || photos.length > 20) fail('사진은 최대 20장입니다.');
  let bytes = 0;
  for (const photo of photos) {
    if (typeof photo !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(photo)) fail('지원하지 않는 사진입니다.');
    bytes += Buffer.byteLength(photo);
  }
  if (bytes > 4 * 1024 * 1024) fail('사진 합계가 4MiB를 초과합니다. 기기 보관함/백업은 유지됩니다.');
  const form = {};
  for (const field of ['ti','mi','ci','ii']) form[field] = text(p.form?.[field] ?? '', 20000);
  if (Buffer.byteLength(JSON.stringify({data,form})) > 650000) fail('본문과 원문 데이터가 너무 큽니다. 기기 백업은 유지됩니다.');
  return { id: input.id, requestId: input.requestId, expectedVersion: input.expectedVersion,
    post: { title: text(p.title, 500), type: text(p.type ?? '', 50), volume: text(p.volume ?? '', 20),
      date: text(p.date ?? '', 100), data, form, schemaVersion: 1 }, photos };
}
export async function saveOwnedPost(db, uid, input) {
  const {id, requestId, expectedVersion, post, photos} = validatePost(input);
  const ref = db.doc(`posts/${id}`);
  const chunks = new Map();
  photos.forEach((photo, imageIndex) => {
    for (let offset = 0, part = 0; offset < photo.length; offset += 180000, part++) {
      chunks.set(`${imageIndex}_${part}`, { imageIndex, part, value: photo.slice(offset, offset + 180000) });
    }
  });
  return db.runTransaction(async tx => {
    const old = await tx.get(ref);
    if (old.exists && old.data().uid !== uid) throw new HttpsError('permission-denied','다른 회원의 글입니다.');
    if (old.exists && old.data().lastRequestId === requestId) return {id, version: old.data().version};
    if ((old.data()?.version ?? 0) !== expectedVersion) throw new HttpsError('aborted','다른 기기에서 수정되었습니다. 새로 불러오세요.');
    const oldChunks = await tx.get(ref.collection('photoChunks'));
    const version = expectedVersion + 1;
    tx.set(ref, {...post, uid, photoCount: photos.length, version, lastRequestId: requestId,
      createdAt: old.data()?.createdAt ?? FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp()});
    for (const doc of oldChunks.docs) if (!chunks.has(doc.id)) tx.delete(doc.ref);
    for (const [key, value] of chunks) tx.set(ref.collection('photoChunks').doc(key), value);
    return { id, version };
  });
}
export async function loadOwnedPost(db, uid, id) {
  if (typeof id !== 'string' || !idPattern.test(id)) fail('잘못된 글 ID입니다.');
  return db.runTransaction(async tx => {
    const ref = db.doc(`posts/${id}`);
    const doc = await tx.get(ref);
    if (!doc.exists) throw new HttpsError('not-found','글이 없습니다.');
    if (doc.data().uid !== uid) throw new HttpsError('permission-denied','다른 회원의 글입니다.');
    const chunks = await tx.get(ref.collection('photoChunks'));
    const imgs = Array.from({length: doc.data().photoCount}, () => []);
    for (const chunk of chunks.docs) {
      const {imageIndex, part, value} = chunk.data(); imgs[imageIndex][part] = value;
    }
    return {...doc.data(), id, imgs: imgs.map(parts => parts.join(''))};
  });
}
