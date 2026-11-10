import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';
import { getFunctions, connectFunctionsEmulator } from 'firebase/functions';
const env = import.meta.env;
export const emulatorMode = env.VITE_USE_EMULATORS !== 'false' && (!env.VITE_FIREBASE_PROJECT_ID || env.VITE_USE_EMULATORS === 'true');
if (!emulatorMode && !env.VITE_FIREBASE_API_KEY) throw new Error('Firebase 웹 설정이 필요합니다. .env.example을 확인하세요.');
const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY || 'demo-key',
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || 'demo-jaeinit.firebaseapp.com',
  projectId: env.VITE_FIREBASE_PROJECT_ID || 'demo-jaeinit',
  appId: env.VITE_FIREBASE_APP_ID || 'demo-app'
});
if (emulatorMode && app.options.projectId !== 'demo-jaeinit') throw new Error('에뮬레이터는 demo-jaeinit 프로젝트만 사용하세요.');
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, 'asia-northeast3');
if (emulatorMode) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', {disableWarnings:true});
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
}
