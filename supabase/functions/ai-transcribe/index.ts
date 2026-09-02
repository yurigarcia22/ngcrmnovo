// =====================================================================
// IA INTELIGENCIA — Transcricao de audios
// Audios das conversas viram texto (transcription) para: (1) o gestor ler
// sem ouvir; (2) o motor de analise ENTENDER conversas faladas — clinica
// vive de audio. Roda no cron a cada 2 min; nunca envia mensagem.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function transcribe(url: string, apiKey: string): Promise<string | null> {
  const audio = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!audio.ok) return null;
  const bytes = await audio.arrayBuffer();
  if (bytes.byteLength < 200 || bytes.byteLength > 24_000_000) return null;

  const form = new FormData();
  const ext = url.split('.').pop()?.split('?')[0] || 'ogg';
  form.append('file', new Blob([bytes]), `audio.${ext}`);
  form.append('model', 'gpt-4o-mini-transcribe');
  form.append('language', 'pt');

  const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  if (!resp.ok) throw new Error(`transcribe ${resp.status}: ${(await resp.text()).slice(0, 150)}`);
  const j = await resp.json();
  return (j.text ?? '').trim() || null;
}

Deno.serve(async (req) => {
  const key = req.headers.get('x-cron-key');
  if (!key || key !== Deno.env.get('AI_CRON_KEY')) return new Response('unauthorized', { status: 401 });
  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) return new Response(JSON.stringify({ error: 'OPENAI_API_KEY ausente' }), { status: 500 });

  // Audios pendentes de tenants com IA ativa, respeitando o corte analyze_from
  const { data: tenants } = await supabase.from('ai_settings').select('tenant_id, analyze_from').eq('enabled', true);
  const results: Record<string, unknown>[] = [];
  for (const t of tenants ?? []) {
    const { data: audios } = await supabase
      .from('messages')
      .select('id, deal_id, media_url')
      .eq('tenant_id', t.tenant_id).eq('type', 'audio')
      .not('media_url', 'is', null).is('transcription', null)
      .gte('created_at', t.analyze_from ?? '1970-01-01')
      .order('created_at', { ascending: false })
      .limit(6);
    for (const a of audios ?? []) {
      try {
        const text = await transcribe(a.media_url as string, apiKey);
        // vazio/ilegivel: marca com placeholder pra nao re-tentar em loop
        await supabase.from('messages')
          .update({ transcription: text ?? '[áudio sem fala detectável]' })
          .eq('id', a.id);
        if (text && a.deal_id) {
          // conversa ganhou texto novo: re-analisar com o audio legivel
          await supabase.from('deal_ai_state')
            .update({ last_analyzed_message_at: null })
            .eq('deal_id', a.deal_id);
        }
        results.push({ id: a.id, ok: true, chars: text?.length ?? 0 });
      } catch (e) {
        results.push({ id: a.id, error: String((e as Error).message).slice(0, 120) });
      }
    }
  }
  return new Response(JSON.stringify({ transcribed: results.length, results }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
