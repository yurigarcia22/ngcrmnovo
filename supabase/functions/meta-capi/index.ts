// =====================================================================
// META CONVERSIONS API — devolve para a campanha o que aconteceu com o lead
//
// A Meta so sabe quem preencheu o formulario. Quem virou reuniao e quem
// fechou contrato esta no CRM. Esta funcao manda esses estagios de volta,
// para a campanha otimizar por venda em vez de por volume de formulario.
//
// Nunca envia dado cru: telefone e e-mail vao em SHA-256, como a Meta exige.
// Chamada pelo pg_cron com header x-cron-key.
// =====================================================================
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

const LOTE = 25;

async function sha256(v: string): Promise<string> {
  const bytes = new TextEncoder().encode(v);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Telefone precisa ir no formato E.164 sem simbolos (5535999999999)
function normalizaTelefone(tel: string | null): string | null {
  if (!tel) return null;
  const so = tel.replace(/\D/g, '');
  if (so.length < 10) return null;
  return so.startsWith('55') ? so : `55${so}`;
}

function normalizaEmail(email: string | null): string | null {
  if (!email) return null;
  const e = email.trim().toLowerCase();
  return e.includes('@') ? e : null;
}

// A Meta quer o lead_id numerico; a planilha entrega no formato "l:1604741101252577"
function limpaLeadId(v: string | null): string | null {
  if (!v) return null;
  const so = v.replace(/\D/g, '');
  return so.length >= 10 ? so : null;
}

Deno.serve(async (req) => {
  const key = req.headers.get('x-cron-key');
  if (!key || key !== Deno.env.get('AI_CRON_KEY')) {
    return new Response('unauthorized', { status: 401 });
  }

  // Permite forcar um tenant especifico (teste manual)
  let soTenant: string | null = null;
  try {
    const body = await req.json();
    if (typeof body?.tenant === 'string') soTenant = body.tenant;
  } catch { /* cron manda {} */ }

  const { data: configs } = await supabase
    .from('meta_capi_settings').select('*').eq('enabled', true);
  if (!configs || configs.length === 0) {
    return Response.json({ ok: true, nota: 'nenhum cliente com a integracao ligada' });
  }

  const resultados: Record<string, unknown>[] = [];

  for (const cfg of configs) {
    if (soTenant && cfg.tenant_id !== soTenant) continue;
    if (!cfg.dataset_id || !cfg.access_token) {
      resultados.push({ tenant: cfg.tenant_id, erro: 'dataset_id ou access_token ausente' });
      continue;
    }

    const { data: fila } = await supabase
      .from('meta_capi_events')
      .select('id, deal_id, event_name, event_id, event_time, attempts')
      .eq('tenant_id', cfg.tenant_id)
      .in('status', ['pending', 'error'])
      .lt('attempts', 5)
      .order('created_at', { ascending: true })
      .limit(LOTE);

    if (!fila || fila.length === 0) {
      resultados.push({ tenant: cfg.tenant_id, enviados: 0 });
      continue;
    }

    const dealIds = [...new Set(fila.map((f) => f.deal_id))];
    const { data: deals } = await supabase
      .from('deals')
      .select('id, value, meta_lead_id, ctwa_clid, contact:contacts ( name, phone, email )')
      .in('id', dealIds);
    const porDeal = new Map((deals ?? []).map((d) => [d.id, d]));

    const eventos: Record<string, unknown>[] = [];
    const usados: number[] = [];
    const semIdentificador: number[] = [];
    const foraDaJanela: number[] = [];
    // A Meta recusa evento com mais de ~7 dias quando ele chega como
    // system_generated. Pelo caminho offline (physical_store) ela aceita ate
    // 62 dias, com janela de atribuicao de 28 dias. Venda de ciclo longo e
    // reprocessamento antigo entram por ali.
    const AGORA = Date.now();
    const LIMITE_DIRETO = 6 * 24 * 3600_000;    // margem de seguranca sobre os 7 dias
    const LIMITE_OFFLINE = 60 * 24 * 3600_000;  // margem sobre os 62 dias

    for (const f of fila) {
      const idade = AGORA - new Date(f.event_time as string).getTime();
      if (idade > LIMITE_OFFLINE) { foraDaJanela.push(f.id); continue; }
      const d = porDeal.get(f.deal_id) as Record<string, unknown> | undefined;
      if (!d) { semIdentificador.push(f.id); continue; }
      // so vai quem veio de anuncio
      if (!d.meta_lead_id && !d.ctwa_clid) { semIdentificador.push(f.id); continue; }
      const contato = (d.contact ?? {}) as Record<string, string | null>;

      const user_data: Record<string, unknown> = {};
      const leadId = limpaLeadId(d.meta_lead_id as string | null);
      if (leadId) user_data.lead_id = Number(leadId);

      const tel = normalizaTelefone(contato.phone);
      if (tel) user_data.ph = [await sha256(tel)];
      const email = normalizaEmail(contato.email);
      if (email) user_data.em = [await sha256(email)];

      // Quanto mais identificadores, maior a chance de a Meta achar a pessoa.
      // So com telefone a correspondencia fica fraca e a venda nao e atribuida.
      const nome = String(contato.name ?? '').trim().toLowerCase()
        .normalize('NFD').replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
      const partes = nome ? nome.split(' ') : [];
      if (partes.length > 0 && partes[0].length > 1) user_data.fn = [await sha256(partes[0])];
      if (partes.length > 1) {
        const ultimo = partes[partes.length - 1];
        if (ultimo.length > 1) user_data.ln = [await sha256(ultimo)];
      }
      user_data.country = [await sha256('br')];
      user_data.external_id = [await sha256(String(d.id))];

      // Sem lead_id, telefone ou e-mail a Meta nao consegue casar o evento
      if (!user_data.lead_id && !user_data.ph && !user_data.em) {
        semIdentificador.push(f.id);
        continue;
      }

      const custom_data: Record<string, unknown> = {
        lead_event_source: 'CRM NG',
        event_source: 'crm',
      };
      // Valor so no evento de fechamento. Se fosse em todos, a Meta somaria a
      // mesma venda tres vezes e o ROAS sairia inflado.
      if (f.event_name === cfg.evento_ganhou) {
        const valor = Number(d.value ?? 0) > 0 ? Number(d.value) : Number(cfg.valor_padrao ?? 0);
        if (valor > 0) {
          custom_data.value = valor;
          custom_data.currency = cfg.moeda ?? 'BRL';
        }
      }

      eventos.push({
        event_name: f.event_name,
        event_time: Math.floor(new Date(f.event_time as string).getTime() / 1000),
        event_id: f.event_id,
        // A venda SEMPRE vai pelo caminho offline: o ciclo daqui leva semanas e
        // o caminho direto so atribui em 7 dias de clique, contra 28 do offline.
        // Lead e reuniao continuam diretos, porque acontecem rapido e sao o que
        // alimenta a otimizacao por leads de conversao.
        action_source: (f.event_name === cfg.evento_ganhou || idade > LIMITE_DIRETO)
          ? 'physical_store' : 'system_generated',
        user_data,
        custom_data,
      });
      usados.push(f.id);
    }

    if (foraDaJanela.length > 0) {
      await supabase.from('meta_capi_events')
        .update({ status: 'skipped', detail: 'evento com mais de 60 dias: a Meta nao aceita nem pelo caminho offline' })
        .in('id', foraDaJanela);
    }
    if (semIdentificador.length > 0) {
      await supabase.from('meta_capi_events')
        .update({ status: 'skipped', detail: 'sem lead_id, telefone ou e-mail para casar o evento' })
        .in('id', semIdentificador);
    }
    if (eventos.length === 0) {
      resultados.push({ tenant: cfg.tenant_id, enviados: 0, ignorados: semIdentificador.length, fora_da_janela: foraDaJanela.length });
      continue;
    }

    const corpo: Record<string, unknown> = { data: eventos };
    if (cfg.test_event_code) corpo.test_event_code = cfg.test_event_code;

    const url = `https://graph.facebook.com/${cfg.api_version}/${cfg.dataset_id}/events`
      + `?access_token=${encodeURIComponent(cfg.access_token)}`;

    let resposta: Record<string, unknown> = {};
    let ok = false;
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(30000),
      });
      resposta = await r.json().catch(() => ({}));
      ok = r.ok && !(resposta as { error?: unknown }).error;
    } catch (e) {
      resposta = { erro_local: String((e as Error).message).slice(0, 300) };
    }

    // Token nunca vai para o log
    const requestSalvo = { data: eventos, test_event_code: cfg.test_event_code ?? null };

    if (ok) {
      await supabase.from('meta_capi_events')
        .update({ status: 'sent', sent_at: new Date().toISOString(), response: resposta, request: requestSalvo, detail: null })
        .in('id', usados);
    } else {
      for (const id of usados) {
        const atual = fila.find((f) => f.id === id);
        await supabase.from('meta_capi_events').update({
          status: 'error',
          attempts: (atual?.attempts ?? 0) + 1,
          response: resposta,
          request: requestSalvo,
          detail: JSON.stringify(resposta).slice(0, 400),
        }).eq('id', id);
      }
    }

    resultados.push({
      tenant: cfg.tenant_id,
      enviados: ok ? usados.length : 0,
      falhas: ok ? 0 : usados.length,
      ignorados: semIdentificador.length,
      fora_da_janela: foraDaJanela.length,
      recebido_pela_meta: (resposta as { events_received?: number }).events_received ?? null,
      erro: ok ? null : resposta,
    });
  }

  return Response.json({ ok: true, resultados });
});
