// Firebase stub - app now uses simple session auth + REST API
// All Firebase functions are stubbed to prevent import errors

export const db = null as any;
export const auth = null as any;
export const storage = null as any;

export const onSnapshot = (path: string, callback: (doc: any) => void) => {
  // Stub - returns no-op unsubscribe
  console.warn('onSnapshot stub called for:', path);
  return () => {};
};

export const collection = (db: any, name: string) => ({ _path: name, _type: 'collection' });
export const doc = (db: any, path: string) => ({ _path: path, _type: 'doc' });
export const query = (...args: any[]) => ({ _type: 'query', args });
export const where = (field: string, op: string, value: any) => ({ _type: 'where', field, op, value });
export const getDocs = async (ref: any) => ({ empty: true, docs: [], forEach: () => {} });
export const getDoc = async (ref: any) => ({ exists: () => false, data: () => ({}) });
export const addDoc = async (ref: any, data: any) => ({ id: 'stub-' + Date.now() });
export const setDoc = async (ref: any, data: any) => {};
export const updateDoc = async (ref: any, data: any) => {};
export const deleteDoc = async (ref: any) => {};
export const onAuthStateChanged = (auth: any, callback: (user: any) => void) => {
  callback(null);
  return () => {};
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: any;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  console.warn('FirestoreError (stub):', error, operationType, path);
}

export const signInWithGoogle = async () => { console.warn('signInWithGoogle stub'); };
export const logOut = async () => { console.warn('logOut stub'); };
