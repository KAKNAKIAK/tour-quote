
import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, Query, DocumentData } from 'firebase/firestore';
import { db } from '../firebase';
import { FirestoreDocument } from '../types';

export function useFirestoreCollection<T extends FirestoreDocument>(collectionName: string, firestoreQuery?: Query<DocumentData>) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    setLoading(true);
    const q = firestoreQuery || query(collection(db, collectionName));

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const items: T[] = [];
      querySnapshot.forEach((doc) => {
        items.push({ id: doc.id, ...doc.data() } as T);
      });
      setData(items);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setError(err);
      setLoading(false);
    });

    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionName, firestoreQuery]);

  return { data, loading, error };
}
