import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const result={title_1:'서울 카페 후기',title_2:'서울 여행',title_3:'카페 추천',keyword_main:'카페',keyword_sub:'커피',keyword_location:'서울',keyword_intent:'후기',body:'원래 본문\n[사진1]\n사진 캡션',hashtags:['#서울','#카페'],reel:'릴스',thumbnail:'썸네일',place_name:'서울 카페',place_address:'서울시'};
const photo='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
async function seed(page){
 await page.addInitScript(({result})=>{
  if(!localStorage.getItem('seeded')){
   localStorage.setItem('jaeinit_saved_posts',JSON.stringify([{id:123,title:'기존 v3 글',type:'카페',date:'2026',data:result}]));
   localStorage.setItem('jaeinit_claude_key','obsolete-key');
   localStorage.setItem('jaeinit_naver_sec','obsolete-secret');
   localStorage.setItem('seeded','yes');
  }
 },{result});
}
test('legacy migration, original result panels, safe preview, photos, draft and local save persist after reload',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await seed(page);await page.goto('/');
 await expect(page.locator('#savedCount')).toHaveText('1');
 expect(await page.evaluate(()=>localStorage.getItem('jaeinit_claude_key'))).toBeNull();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('jaeinit_saved_posts')).length)).toBe(1);
 await page.locator('#tabSaved').click();await page.getByRole('button',{name:'📄 불러오기',exact:true}).click();
 await expect(page.locator('#btxt')).toContainText('원래 본문');
 await expect(page.locator('#placeInfo')).toContainText('서울시');
 await expect(page.locator('#tcs .tc')).toHaveCount(3);
 await page.locator('#fi').setInputFiles({name:'photo.png',mimeType:'image/png',buffer:Buffer.from(photo.split(',')[1],'base64')});
 await expect(page.locator('#pg .pi')).toHaveCount(1);
 await page.locator('#ti').fill('작성 원문 제목');
 await page.locator('#ci').fill('기존 내용이 유실되지 않음');
 await page.locator('#tabPreview').click();await expect(page.locator('#previewArea img')).toHaveCount(1);
 await page.reload();await expect(page.locator('#ti')).toHaveValue('작성 원문 제목');
 await expect(page.locator('#ci')).toHaveValue('기존 내용이 유실되지 않음');
 await expect(page.locator('#pg .pi')).toHaveCount(1);
 await expect(page.locator('#btxt')).toContainText('원래 본문');
 await page.locator('#saveBtn').click();await expect(page.locator('#saveBtn')).toHaveText('✅ 기기에 저장됨');
 await page.locator('#tabSaved').click();await expect(page.locator('#savedList')).toContainText('기존 v3 글');
 const downloadPromise=page.waitForEvent('download');await page.locator('#backupBtn').click();
 const download=await downloadPromise;expect(download.suggestedFilename()).toBe('jaeinit-backup.json');
 const backup=JSON.parse(await readFile(await download.path(),'utf8'));
 expect(backup.posts.some(p=>p.imgs?.length===1)).toBe(true);
 expect(backup.draft.form.ci).toBe('기존 내용이 유실되지 않음');
 expect(JSON.stringify(backup)).not.toContain('obsolete-secret');
 await page.screenshot({path:'test-results/studio.png',fullPage:true});
 expect(errors).toEqual([]);
});
test('anonymous generation is blocked without direct provider request and does not alter input',async({page})=>{
 const providerCalls=[];page.on('request',r=>{if(/anthropic|openapi.naver|tosspayments/.test(r.url()))providerCalls.push(r.url());});
 await page.goto('/');await page.locator('#ti').fill('유지할 제목');await page.locator('#gb').click();
 await expect(page.locator('#modal')).toBeVisible();await expect(page.locator('#eb')).toContainText('로그인');
 await expect(page.locator('#ti')).toHaveValue('유지할 제목');expect(providerCalls).toEqual([]);
});
test('stored external HTML is escaped; deletion does not reimport preserved legacy source',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('jaeinit_saved_posts',JSON.stringify([{id:1,title:'공격 문자열',data:{body:'<img src=x onerror=alert(1)>',title_1:'<script>bad</script>',place_name:'<img src=x onerror=alert(1)>',hashtags:['#<img/src=x/onerror=alert(1)>']}}])));
 await page.goto('/');await expect(page.locator('#savedCount')).toHaveText('1');await page.locator('#tabSaved').click();
 await page.getByRole('button',{name:'📄 불러오기',exact:true}).click();
 await expect(page.locator('#placeInfo img')).toHaveCount(0);
 await page.locator('#tabPreview').click();await expect(page.locator('#previewArea img')).toHaveCount(0);
 await page.locator('#tabSaved').click();
 page.on('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'🗑️ 기기 보관함 전체 삭제'}).click();
 await expect(page.locator('#savedCount')).toHaveText('');await page.reload();await expect(page.locator('#savedCount')).toHaveText('');
 expect(await page.evaluate(()=>localStorage.getItem('jaeinit_saved_posts'))).toContain('공격 문자열');
});

test('JSON import preserves active draft, restores photos and remains idempotent',async({page})=>{
 await page.goto('/');await expect(page.locator('#savedCount')).toHaveText('');
 await page.locator('#ti').fill('작성 중 제목');await page.locator('#tabSaved').click();
 page.on('dialog',d=>d.accept());
 const backup={schemaVersion:1,posts:[{id:'restore',title:'복원 글',data:result,imgs:[photo],form:{ci:'복원한 원문'}}]};
 const file={name:'backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))};
 await page.locator('#backupFile').setInputFiles(file);await expect(page.locator('#savedCount')).toHaveText('1');
 await page.locator('#backupFile').setInputFiles(file);await expect(page.locator('#savedCount')).toHaveText('1');
 await expect(page.locator('#ti')).toHaveValue('작성 중 제목');
 await page.getByRole('button',{name:'📄 불러오기',exact:true}).click();
 await expect(page.locator('#ci')).toHaveValue('복원한 원문');await expect(page.locator('#pg img')).toHaveCount(1);
});
