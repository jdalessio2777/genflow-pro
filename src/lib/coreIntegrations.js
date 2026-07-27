import { supabase } from '@/lib/supabaseClient';

const storageBucket = import.meta.env.VITE_SUPABASE_STORAGE_BUCKET || 'uploads';

/**
 * Drop-in replacements for Base44 `integrations.Core` helpers (storage + edge functions).
 */
export const integrationsCore = {
  async UploadFile({ file }) {
    const safeName = (file?.name || 'upload').replace(/[^\w.-]/g, '_');
    const path = `${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}-${safeName}`;
    const { error } = await supabase.storage.from(storageBucket).upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });
    if (error) throw error;
    const { data } = supabase.storage.from(storageBucket).getPublicUrl(path);
    return { file_url: data.publicUrl };
  },

  async SendEmail({ to, subject, html }) {
    const resp = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to, subject, html }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'Failed to send email');
    return data;
  },

  async InvokeLLM(body) {
    const { data, error } = await supabase.functions.invoke('invoke-llm', { body });
    if (error) throw error;
    if (typeof data === 'string') return data;
    return data?.result ?? data?.output ?? data;
  },
};
