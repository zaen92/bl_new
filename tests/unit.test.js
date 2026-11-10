import {test} from 'node:test';
import assert from 'node:assert/strict';
import {signupIdentity} from '../functions/src/profile.js';
import {validatePost} from '../functions/src/posts.js';
import {buildPrompt} from '../functions/src/prompt.js';
test('signup HMAC canonicalizes verified email and hides raw address',()=>{
 const key='unit-only-key-000000000000000000000';
 const digest=signupIdentity(' Member@Example.com ',key);
 assert.equal(digest,signupIdentity('member@example.com',key));
 assert.match(digest,/^[a-f0-9]{64}$/);
 assert.notEqual(digest,signupIdentity('other@example.com',key));
 assert.throws(()=>signupIdentity('a@example.com','short'));
});
test('post validator retains original fields and rejects malformed budgets',()=>{
 const input={id:'local-123',requestId:'req',expectedVersion:0,post:{title:'서울',data:{body:'본문',hashtags:['#서울']},form:{ci:'원문'},imgs:[]}};
 const normalized=validatePost(input);
 assert.equal(normalized.post.form.ci,'원문');assert.equal(normalized.post.data.body,'본문');
 for(const override of [{expectedVersion:-1},{id:'../users/alice'},{post:{...input.post,imgs:['javascript:alert(1)']}},{post:{...input.post,data:{body:'x',hashtags:'invalid'}}}])assert.throws(()=>validatePost({...input,...override}));
});
test('original Korean prompt, volume, photo placement and JSON contract retained',()=>{
 const prompt=buildPrompt({title:'서울 카페',memo:'메모',content:'직접 경험',placeInfo:'주소',type:'카페',volume:'long',photos:['photo']});
 for(const fragment of ['1800~2100자','서울 카페','직접 경험','여행블로거 잰잇','[사진1]','"body"','"hashtags"','"reel"','"thumbnail"'])assert.ok(prompt.includes(fragment),fragment);
});
