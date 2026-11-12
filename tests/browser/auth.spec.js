import {test,expect} from '@playwright/test';
test.skip(!process.env.AUTH_EMULATOR_TESTS,'Run through npm run test:auth with Auth Emulator');
test('email signup, verification requirement, logout and email login against real Auth Emulator',async({page})=>{
 const email=`browser-${Date.now()}@example.test`;
 await page.goto('/');await page.locator('#stx').click();
 await page.locator('#email').fill(email);await page.locator('#password').fill('test-password-123');
 await page.locator('#signupBtn').click();
 await expect(page.locator('#accountProfile')).toContainText(email);
 await expect(page.locator('#stxStatus')).toHaveText('이메일 인증 필요');
 await expect(page.locator('#authMessage')).toContainText('인증 메일');
 await page.locator('#logoutBtn').click();await expect(page.locator('#authForm')).toBeVisible();
 await page.locator('#password').fill('test-password-123');await page.locator('#authForm button[type=submit]').click();
 await expect(page.locator('#accountProfile')).toContainText(email);
 await expect(page.locator('#stxStatus')).toHaveText('이메일 인증 필요');
});
test('Google popup signs in through Auth Emulator without a browser API provider key',async({page})=>{
 test.setTimeout(60000);let checkpoint='page init';
 const safeURL=value=>{try{const u=new URL(value);return u.origin+u.pathname;}catch{return 'unknown';}};
 page.on('response',r=>{if(r.url().startsWith('https://apis.google.com/'))console.log('Google SDK response:',r.status(),safeURL(r.url()));});
 try{
 await page.goto('/');await page.locator('#stx').click();
 page.on('requestfailed',r=>{if(r.url().startsWith('https://apis.google.com/'))console.log('Google SDK request failed:',r.url().split('?')[0],r.failure()?.errorText);});
 checkpoint='Google button and popup event';
 const popupPromise=page.waitForEvent('popup');await page.locator('#googleBtn').click();
 const popup=await popupPromise;checkpoint='Emulator Add new account screen';
 await popup.getByText('Add new account',{exact:true}).click();
 await popup.locator('#email-input').fill('google-browser@example.test');
 checkpoint='Emulator sign-in';await popup.locator('#sign-in').click();checkpoint='main-page Auth state';
 await expect(page.locator('#accountProfile')).toContainText('google-browser@example.test');
 await expect(page.locator('#stx')).toHaveText('👤 내 계정');
 await expect(page.locator('#authForm')).toBeHidden();checkpoint='complete';
 }finally{console.log('Google Emulator checkpoint:',checkpoint);for(const p of page.context().pages())console.log('Google test page:',safeURL(p.url()));}
});
