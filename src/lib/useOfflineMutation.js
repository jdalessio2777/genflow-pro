import { useMutation, useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/db';
import { queueOperation } from './offlineQueue';
import { useOffline } from './OfflineContext';
import { toast } from 'sonner';

export function useOfflineMutation({ entity, type, queryKeys = [], onSuccess, onError }) {
  const queryClient = useQueryClient();
  const { isOnline, updatePendingCount } = useOffline();

  return useMutation({
    mutationFn: async ({ entityId, data }) => {
      if (!isOnline) {
        await queueOperation({ entity, type, entityId, data });
        await updatePendingCount();
        return { offline: true, data };
      }

      const entityObj = db[entity];
      if (type === 'create') return entityObj.create(data);
      if (type === 'update') return entityObj.update(entityId, data);
      if (type === 'delete') return entityObj.delete(entityId);
    },
    onSuccess: (result, variables) => {
      if (result?.offline) {
        toast.info('Saved offline — will sync when connected');
      }
      queryKeys.forEach(key => queryClient.invalidateQueries({ queryKey: [key] }));
      onSuccess?.(result, variables);
    },
    onError: (error, variables) => {
      onError?.(error, variables);
    },
  });
}