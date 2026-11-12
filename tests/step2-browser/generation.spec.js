import {test,expect} from '@playwright/test';
import {initializeApp,deleteApp,getAuth,getFirestore} from '../../functions/src/admin.js';
if(!process.env.FIRESTORE_EMULATOR_HOST)throw new Error('STEP2 E2E requires demo emulators.');
const app=initializeApp({projectId:'demo-jaeinit'}),auth=getAuth(app),db=getFirestore(app);
let sequence=0;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
test.afterAll(async()=>{await db.terminate();await deleteApp(app);});
async function signIn(page){
 sequence++;const uid='step2-e2e-'+sequence;
 const email=uid+'@example.test';await auth.createUser({uid,email,password:'test-password-123',emailVerified:true});
 await page.goto('/');await page.locator('#stx').click();await page.locator('#email').fill(email);await page.locator('#password').fill('test-password-123');await page.locator('#authForm button[type=submit]').click();
 await expect(page.locator('#stxStatus')).toHaveText('크레딧 2개',{timeout:30000});await page.getByRole('button',{name:'닫기',exact:true}).first().click();
 return uid;
}
async function form(page,title='서울 카페'){
 await page.locator('#ti').fill(title);await page.locator('#ci').fill('직접 방문해서 커피와 디저트를 먹었습니다.');
 await page.locator('.tb').filter({hasText:'카페'}).click();await page.locator('.vb').filter({hasText:'보통'}).click();
}
async function completed(page){await expect(page.locator('#generationStatus')).toContainText('생성 완료',{timeout:45000});await expect(page.locator('#rb3')).toHaveClass('rb on');}
test('two free real Callable/mock-worker generations consume 2 and zero balance blocks third',async({page})=>{
 const uid=await signIn(page);await form(page);
 for(const left of [1,0]){await page.locator('#gb').click();await completed(page);await expect(page.locator('#stxStatus')).toHaveText(`크레딧 ${left}개`);}
 await page.locator('#gb').click();await expect(page.locator('#eb')).toContainText('크레딧');await expect(page.locator('#creditHint')).toContainText('충전');
 const generations=await db.collection('generations').where('uid','==',uid).get();assertCount(generations.size,2);
});
function assertCount(actual,expected){expect(actual).toBe(expected);}
test('two compressed photos render, save free, copy to private cloud and reopen with photos',async({page})=>{
 const uid=await signIn(page);await form(page,'사진 카페');
 await page.locator('#fi').setInputFiles([{name:'one.png',mimeType:'image/png',buffer:png},{name:'two.png',mimeType:'image/png',buffer:png}]);
 await expect(page.locator('#pg img')).toHaveCount(2);await page.locator('#gb').click();await completed(page);
 await page.locator('#tabPreview').click();await expect(page.locator('#previewArea img')).toHaveCount(2);
 await page.locator('#tabResult').click();await page.locator('#saveBtn').click();await expect(page.locator('#saveBtn')).toHaveText('✅ 기기에 저장됨');
 await page.locator('#tabSaved').click();page.on('dialog',d=>d.accept());
 await page.getByRole('button',{name:'☁️ 내 계정에 복사',exact:true}).first().click();
 await expect(page.locator('#cloudSavedList').getByRole('button',{name:'📄 불러오기',exact:true})).toHaveCount(1,{timeout:30000});
 await page.locator('#cloudSavedList').getByRole('button',{name:'📄 불러오기',exact:true}).click();
 await expect(page.locator('#pg img')).toHaveCount(2);await expect(page.locator('#stxStatus')).toHaveText('크레딧 1개');
 const post=(await db.collection('posts').where('uid','==',uid).get()).docs[0].data();expect(post.photoGroupId).toMatch(/^[a-f0-9]{64}$/);
});
test('refresh restores in-flight generation without repeating AI request or debit',async({page})=>{
 const uid=await signIn(page);await form(page,'새로고침 복구');await page.locator('#gb').click();
 await expect(page.locator('#generationStatus')).toContainText(/접수|시작|검색|작성/,{timeout:20000});await page.reload();
 await completed(page);await expect(page.locator('#stxStatus')).toHaveText('크레딧 1개');
 await page.locator('#tabHistory').click();await expect(page.locator('#generationHistory')).toContainText('[mock]');
 const generations=await db.collection('generations').where('uid','==',uid).get();expect(generations.size).toBe(1);
 expect((await db.doc(`generationCosts/${generations.docs[0].id}`).get()).data().providerCalls).toBe(1);
});
test('account style applies on server and editing/copying/saving does not call an AI browser API',async({page})=>{
 const external=[];page.on('request',r=>{if(/api\.anthropic\.com|openapi\.naver\.com/.test(r.url()))external.push(r.url());});
 await signIn(page);await page.locator('#stx').click();await page.locator('#styleBtn').click();
 await page.locator('#stylePreset').selectOption('custom');await page.locator('#styleName').fill('제 블로그');await page.locator('#styleGreeting').fill('제 인사말입니다');await page.locator('#styleClosing').fill('제 마무리입니다');await page.locator('#styleTone').selectOption('informative');await page.locator('#styleEmoji').uncheck();
 await page.locator('#styleForm button[type=submit]').click();await expect(page.locator('#styleStatus')).toContainText('저장했습니다');
 await page.locator('#closeStyleBtn').click();await page.getByRole('button',{name:'닫기',exact:true}).first().click();await form(page);await page.locator('#gb').click();await completed(page);
 await expect(page.locator('#btxt')).toContainText('제 인사말입니다');await expect(page.locator('#btxt')).toContainText('제 마무리입니다');
 await page.locator('#editBodyBtn').click();await page.locator('#btxt').fill('직접 무료 수정');await page.locator('#editBodyBtn').click();
 await page.locator('#saveBtn').click();await expect(page.locator('#stxStatus')).toHaveText('크레딧 1개');expect(external).toEqual([]);
});
