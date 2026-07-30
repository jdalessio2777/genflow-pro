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

  // Most transient failures (a brief network blip, a momentary API hiccup)
  // resolve themselves within seconds. Retries immediately, then after 3s,
  // then after 10s — 3 attempts total — before giving up. Throws the last
  // error once all attempts are exhausted, same contract as SendEmail.
  async SendEmailWithRetry({ to, subject, html }, delays = [3000, 10000]) {
    let lastError;
    for (let attempt = 0; attempt <= delays.length; attempt++) {
      try {
        return await this.SendEmail({ to, subject, html });
      } catch (e) {
        lastError = e;
        if (attempt < delays.length) {
          await new Promise(resolve => setTimeout(resolve, delays[attempt]));
        }
      }
    }
    throw lastError;
  },

  async InvokeLLM(body) {
    const { data, error } = await supabase.functions.invoke('invoke-llm', { body });
    if (error) throw error;
    if (typeof data === 'string') return data;
    return data?.result ?? data?.output ?? data;
  },
};
