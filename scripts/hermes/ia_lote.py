"""Motor de IA do CRM NG rodando no Hermes (Opus pela assinatura do Claude).

Roda de hora em hora como cron `--no-agent` do Hermes:
  1. pede conversas pendentes a API de lote do CRM (ai-analyze/lote/pendentes);
  2. analisa em lotes com o Claude Code SEM NENHUMA FERRAMENTA (--tools ""):
     entra texto, sai JSON travado no schema do CRM. Conversa de WhatsApp e
     conteudo de terceiro; sem ferramenta, nada que um lead escreva vira comando;
  3. devolve em ai-analyze/lote/resultado, que valida e grava com as mesmas
     regras do motor GPT (piloto, eventos, alertas).
O Hermes nunca toca no banco. Se o PC ficar desligado, a proxima execucao pega
tudo o que ficou pendente; se passar 2h sem rodar no horario comercial, o GPT
do CRM assume sozinho ate o Hermes voltar.

Variaveis de ambiente (no .env do perfil do Hermes):
  CRM_LOTE_KEY           chave x-lote-key (obrigatoria)
  CRM_LOTE_URL           padrao: https://twsnyobgvwvuqjgemrca.supabase.co/functions/v1/ai-analyze/lote/
  CRM_LOTE_MODELO        padrao: opus
  CRM_LOTE_POR_CHAMADA   conversas por chamada ao modelo (padrao 8)
  CRM_LOTE_MAX           teto de conversas por execucao (padrao 160)

Saida: uma linha JSON com o resumo (analisadas, erros, tokens) para o Hermes
registrar ou mandar no Telegram.
"""
import json, os, shutil, subprocess, sys, time, urllib.error, urllib.request

BASE = os.environ.get("CRM_LOTE_URL", "https://twsnyobgvwvuqjgemrca.supabase.co/functions/v1/ai-analyze/lote/")
KEY = os.environ.get("CRM_LOTE_KEY", "")
MODELO = os.environ.get("CRM_LOTE_MODELO", "opus")
POR_CHAMADA = int(os.environ.get("CRM_LOTE_POR_CHAMADA", "8"))
MAXIMO = int(os.environ.get("CRM_LOTE_MAX", "160"))
CLAUDE = shutil.which("claude") or "claude"


def api(rota, corpo=None):
    req = urllib.request.Request(
        BASE + rota, method="POST" if corpo is not None else "GET",
        data=json.dumps(corpo).encode() if corpo is not None else None,
        headers={"x-lote-key": KEY, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.loads(r.read())


def analisar(instrucoes, conversas, schema):
    """Uma chamada ao modelo para varias conversas do mesmo cliente."""
    lote_schema = {
        "type": "object", "additionalProperties": False, "required": ["resultados"],
        "properties": {"resultados": {"type": "array", "items": {
            "type": "object", "additionalProperties": False, "required": ["deal_id", "analise"],
            "properties": {"deal_id": {"type": "string"}, "analise": schema}}}},
    }
    texto = ("Analise CADA conversa abaixo de forma independente, seguindo as regras. "
             "Devolva um item em resultados para cada DEAL, copiando o deal_id exatamente.\n\n"
             + "\n\n".join(f"### DEAL {c['deal_id']}\n{c['entrada']}" for c in conversas))
    cmd = [CLAUDE, "-p", "--model", MODELO, "--output-format", "json",
           "--tools", "", "--strict-mcp-config", "--no-session-persistence",
           "--system-prompt", instrucoes, "--json-schema", json.dumps(lote_schema, ensure_ascii=False)]
    r = subprocess.run(cmd, input=texto, capture_output=True, text=True, encoding="utf-8", timeout=900)
    if r.returncode != 0:
        raise RuntimeError(f"claude saiu com {r.returncode}: {(r.stderr or r.stdout)[:400]}")
    saida = json.loads(r.stdout)
    if saida.get("is_error"):
        raise RuntimeError(f"claude devolveu erro: {str(saida.get('result'))[:400]}")
    dados = saida.get("structured_output")
    if dados is None:
        bruto = str(saida.get("result") or "").strip().removeprefix("```json").removesuffix("```")
        dados = json.loads(bruto)
    # O Claude Code tambem usa um modelo pequeno em tarefas auxiliares: o modelo
    # da analise e o que mais escreveu. Tokens somam todos (e o que sai da cota).
    por_modelo = saida.get("modelUsage") or {}
    if por_modelo:
        modelo_real = max(por_modelo, key=lambda m: por_modelo[m].get("outputTokens") or 0)
        entrada = sum(int(v.get(k) or 0) for v in por_modelo.values()
                      for k in ("inputTokens", "cacheReadInputTokens", "cacheCreationInputTokens"))
        saida_tok = sum(int(v.get("outputTokens") or 0) for v in por_modelo.values())
    else:
        uso = saida.get("usage") or {}
        modelo_real = f"claude-{MODELO}"
        entrada = sum(int(uso.get(k) or 0) for k in ("input_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"))
        saida_tok = int(uso.get("output_tokens") or 0)
    return dados.get("resultados", []), entrada, saida_tok, modelo_real


def main():
    if not KEY:
        print(json.dumps({"erro": "CRM_LOTE_KEY ausente"}))
        return 2
    inicio = time.time()
    schema = api("instrucoes")["schema"]
    resumo = {"analisadas": 0, "erros": 0, "tokens_entrada": 0, "tokens_saida": 0, "chamadas": 0, "clientes": {}}
    while resumo["analisadas"] + resumo["erros"] < MAXIMO:
        lote = api("pendentes", {"limite": POR_CHAMADA})
        if not lote.get("total"):
            break
        for cliente in lote["clientes"]:
            conversas = cliente["conversas"]
            nome = cliente.get("nome") or cliente["tenant_id"]
            try:
                resultados, ent, sai, modelo_real = analisar(cliente["instrucoes"], conversas, schema)
            except Exception as e:  # a reserva expira em 20 min e o card volta na proxima execucao
                resumo["erros"] += len(conversas)
                print(f"falha ao analisar {nome}: {e}", file=sys.stderr)
                continue
            resumo["chamadas"] += 1
            ids = {c["deal_id"] for c in conversas}
            resultados = [x for x in resultados if x.get("deal_id") in ids]
            resp = api("resultado", {"modelo": f"{modelo_real} (hermes)", "uso": {"entrada": ent, "saida": sai},
                                     "resultados": resultados})
            resumo["analisadas"] += resp.get("gravados", 0)
            resumo["erros"] += resp.get("erros", 0) + (len(ids) - len(resultados))
            resumo["tokens_entrada"] += ent
            resumo["tokens_saida"] += sai
            c = resumo["clientes"].setdefault(nome, {"analisadas": 0, "movidos": 0})
            c["analisadas"] += resp.get("gravados", 0)
            c["movidos"] += sum(1 for x in resp.get("resultados", []) if x.get("movido_para"))
            for x in resp.get("resultados", []):
                if not x.get("ok"):
                    print(f"recusado {x.get('deal_id')}: {x.get('erro')}", file=sys.stderr)
    resumo["segundos"] = round(time.time() - inicio)
    print(json.dumps(resumo, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except urllib.error.URLError as e:
        print(json.dumps({"erro": f"CRM fora do ar: {e}"}))
        sys.exit(1)
