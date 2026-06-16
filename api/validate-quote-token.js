import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ valid: false });
  }

  const { job_id, token } = req.query;

  if (!job_id || !token) {
    return res.status(400).json({ valid: false });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: job, error } = await supabase
    .from('jobs')
    .select('id, status, quote_approval_token')
    .eq('id', job_id)
    .single();

  if (error || !job) {
    return res.status(200).json({ valid: false });
  }

  if (job.status !== 'quote_sent') {
    return res.status(200).json({ valid: false });
  }

  if (!job.quote_approval_token || job.quote_approval_token !== token) {
    return res.status(200).json({ valid: false });
  }

  return res.status(200).json({ valid: true, job_id: job.id });
}
