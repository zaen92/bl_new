// One resolution boundary for production code and direct integration tests.
// Identical versions installed in different node_modules still have distinct
// FieldValue/Timestamp constructors and must not exchange Firestore objects.
export { initializeApp, deleteApp } from 'firebase-admin/app';
export { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
export { getAuth } from 'firebase-admin/auth';
