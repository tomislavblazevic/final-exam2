// Lightweight Firebase helpers (modular SDK via CDN)
import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js';
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut as fbSignOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js';
import { getFirestore, collection, doc, onSnapshot, setDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js';

let app = null;
let auth = null;
let db = null;

export function initialized() {
  return !!app;
}

export function initFirebaseFromWindow() {
  try {
    if (!window.FIREBASE_CONFIG) return false;
    app = initializeApp(window.FIREBASE_CONFIG);
    auth = getAuth(app);
    db = getFirestore(app);
    return true;
  } catch (e) {
    console.error('Firebase init error', e);
    return false;
  }
}

export function signInWithGoogle() {
  if (!auth) return Promise.reject(new Error('Auth not initialized'));
  const provider = new GoogleAuthProvider();
  return signInWithPopup(auth, provider);
}

export function signOut() {
  if (!auth) return Promise.reject(new Error('Auth not initialized'));
  return fbSignOut(auth);
}

export function onAuthChange(cb) {
  if (!auth) return cb(null);
  return onAuthStateChanged(auth, cb);
}

export function subscribeToUserTasks(uid, onUpdate) {
  if (!db) return () => {};
  const col = collection(db, 'users', uid, 'tasks');
  return onSnapshot(col, snapshot => {
    const tasks = snapshot.docs.map(d => d.data());
    onUpdate(tasks);
  });
}

export async function writeTask(uid, task) {
  if (!db) return;
  await setDoc(doc(db, 'users', uid, 'tasks', task.id), task);
}

export async function deleteTask(uid, id) {
  if (!db) return;
  await deleteDoc(doc(db, 'users', uid, 'tasks', id));
}
