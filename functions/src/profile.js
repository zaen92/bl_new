import { createHmac } from 'node:crypto';
import { FieldValue } from './admin.js';
import {policyFrom} from './service-policy.js';

export function signupIdentity(email, secret) {
  if (!secret || secret.length < 32) throw new Error('SIGNUP_IDENTITY_HMAC_KEY must have at least 32 characters');
  return createHmac('sha256', secret).update(email.trim().toLowerCase()).digest('hex');
}

// Exported separately so emulator tests exercise the actual production transaction.
export async function provisionProfile(db, identity, secret) {
  if (!identity.emailVerified || !identity.email || identity.disabled) {
    throw new Error('VERIFIED_EMAIL_REQUIRED');
  }
  const claimId = signupIdentity(identity.email, secret);
  const userRef = db.doc(`users/${identity.uid}`);
  const claimRef = db.doc(`signupClaims/${claimId}`);
  const ledgerRef = db.doc(`creditLedger/signup_${identity.uid}`);
  return db.runTransaction(async tx => {
    const [user, claim, ledger, policy] = await tx.getAll(userRef, claimRef, ledgerRef, db.doc('ops/service'));
    if(user.exists){
      const u=user.data(),patch={};
      if(!u.tier)patch.tier='FREE';if(!u.signupClaimId)patch.signupClaimId=claimId;
      if(!Number.isSafeInteger(u.exportsUsed))patch.exportsUsed=claim.data()?.exportsUsed||0;
      if(!Number.isSafeInteger(u.savedPostCount))patch.savedPostCount=(await tx.get(db.collection('posts').where('uid','==',identity.uid))).size;
      if(Object.keys(patch).length)tx.update(userRef,patch);
      return {created:false,credits:u.credits};
    }
    const granted = !claim.exists && !ledger.exists;
    const credits = granted ? policyFrom(policy).signupCredits : 0;
    const timestamp = FieldValue.serverTimestamp();
    tx.create(userRef, {
      uid: identity.uid, email: identity.email, displayName: identity.displayName || '',
      tier:'FREE', signupClaimId:claimId, exportsUsed:claim.data()?.exportsUsed||0, savedPostCount:0, styleCount:0,
      photoURL: identity.photoURL || '', credits, freeCredits:credits, paidCredits:0, heldFree:0, heldPaid:0, schemaVersion: 2,
      createdAt: timestamp, updatedAt: timestamp
    });
    if (!claim.exists) tx.create(claimRef, { firstUid: identity.uid, createdAt: timestamp, version: 1 });
    if (granted) tx.create(ledgerRef, {
      uid: identity.uid, delta: credits, balanceAfter: 2, reason: 'signup',
      referenceId: claimId, createdAt: timestamp
    });
    return { created: true, credits };
  });
}
