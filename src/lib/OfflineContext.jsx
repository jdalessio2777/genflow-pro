import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { getPendingOperations, removeOperation, getPendingCount } from './offlineQueue';
import { toast } from 'sonner';

const OfflineContext = createContext();

export function OfflineProvider({ children }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const syncRef = useRef(false);

  const updatePendingCount = useCallback(async () => {
    const count = await getPendingCount();
    setPendingCount(count);
  }, []);

  const syncPendingOperations = useCallback(async () => {
    if (syncRef.current) return;
    syncRef.current = true;
    setSyncing(true);

    try {
      const ops = await getPendingOperations();
      if (ops.length === 0) { setSyncing(false); syncRef.current = false; return; }

      let synced = 0;
      let failed = 0;

      for (const op of ops) {
        try {
          const entity = base44.entities[op.entity];
          if (!entity) { await removeOperation(op.id); continue; }

          if (op.type === 'create') {
            await entity.create(op.data);
          } else if (op.type === 'update') {
            await entity.update(op.entityId, op.data);
          } else if (op.type === 'delete') {
            await entity.delete(op.entityId);
          }

          await removeOperation(op.id);
          synced++;
        } catch (err) {
          console.error('Failed to sync operation:', op, err);
          failed++;
        }
      }

      await updatePendingCount();

      if (synced > 0) {
        toast.success(`Synced ${synced} offline change${synced !== 1 ? 's' : ''}`);
      }
      if (failed > 0) {
        toast.error(`${failed} change${failed !== 1 ? 's' : ''} failed to sync — check your connection`);
      }
    } finally {
      setSyncing(false);
      syncRef.current = false;
    }
  }, [updatePendingCount]);

  useEffect(() => {
    updatePendingCount();

    const handleOnline = () => {
      setIsOnline(true);
      toast.success('Back online — syncing changes...');
      syncPendingOperations();
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.warning("You're offline — changes will sync when connection returns");
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [syncPendingOperations, updatePendingCount]);

  return (
    <OfflineContext.Provider value={{ isOnline, pendingCount, syncing, syncPendingOperations, updatePendingCount }}>
      {!isOnline && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-amber-500 text-white text-center py-2 px-4 text-xs font-semibold flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
          Offline — changes saved locally and will sync when you reconnect
        </div>
      )}
      {isOnline && syncing && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-blue-500 text-white text-center py-2 px-4 text-xs font-semibold flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-white animate-ping" />
          Syncing offline changes...
        </div>
      )}
      {isOnline && !syncing && pendingCount > 0 && (
        <div className="fixed top-0 left-0 right-0 z-[100] bg-orange-500 text-white text-center py-2 px-4 text-xs font-semibold flex items-center justify-center gap-2">
          {pendingCount} change{pendingCount !== 1 ? 's' : ''} pending sync
          <button onClick={syncPendingOperations} className="underline ml-1">Sync now</button>
        </div>
      )}
      {children}
    </OfflineContext.Provider>
  );
}

export function useOffline() {
  return useContext(OfflineContext);
}