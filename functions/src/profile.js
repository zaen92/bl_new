import { createHmac } from 'node:crypto';
import { FieldValue } from './admin.js';

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
    const [user, claim, ledger] = await tx.getAll(userRef, claimRef, ledgerRef);
    if (user.exists) return { created: false, credits: user.data().credits };
    const granted = !claim.exists && !ledger.exists;
    const credits = granted ? 2 : 0;
    const timestamp = FieldValue.serverTimestamp();
    tx.create(userRef, {
      uid: identity.uid, email: identity.email, displayName: identity.displayName || '',
      photoURL: identity.photoURL || '', credits, schemaVersion: 1,
      createdAt: timestamp, updatedAt: timestamp
    });
    if (!claim.exists) tx.create(claimRef, { firstUid: identity.uid, createdAt: timestamp, version: 1 });
    if (granted) tx.create(ledgerRef, {
      uid: identity.uid, delta: 2, balanceAfter: 2, reason: 'signup',
      referenceId: claimId, createdAt: timestamp
    });
    return { created: true, credits };
  });
}
