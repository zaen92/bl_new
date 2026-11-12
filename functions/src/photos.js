import {createHash} from 'node:crypto';
import {HttpsError} from 'firebase-functions/v2/https';
export function decodePhotos(values,config){
 if(!Array.isArray(values)||values.length>config.maxPhotos)throw new HttpsError('invalid-argument','생성 사진은 최대 10장입니다.');
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
