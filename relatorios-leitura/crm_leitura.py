"""Consulta SO LEITURA no banco do CRM NG (Supabase do VPS), pra conferir relatorios de clientes.

Uso no terminal:
  python crm_leitura.py "select ..."            imprime as linhas em JSON
  python crm_leitura.py --tabela "select ..."   imprime como tabela simples
Em Python:
  from crm_leitura import consulta
  linhas = consulta("select ...")               lista de dicionarios

O token fica no arquivo .token desta pasta. Nao comitar, nao colar em chat nem em documento.
Leia o LEIA-ME.md antes da primeira consulta (tabelas, fuso horario e regras).
"""
import json
import os
import sys
import urllib.error
import urllib.request

URL = "https://api.grupong.online/rest/v1/rpc/consulta_leitura"
# Chave publica do CRM (a mesma que vai no navegador); quem da o acesso de leitura e o .token
ANON = ("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkxOTAxMzYyLCJleHAiOjE5NDk1ODEzNjJ9"
        ".eApAXDC4BuuP1u0jdiCZDWdPJ4vOzc5ffD5CB43BOhw")
TOKEN = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".token"), encoding="utf-8").read().strip()


def consulta(sql: str) -> list:
    req = urllib.request.Request(URL, method="POST", data=json.dumps({"sql": sql}).encode(),
                                 headers={"apikey": ANON, "Authorization": f"Bearer {TOKEN}",
                                          "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        corpo = e.read().decode(errors="replace")
        try:
            msg = json.loads(corpo).get("message", corpo)
        except ValueError:
            msg = corpo
        raise RuntimeError(f"consulta recusada ({e.code}): {msg}") from None


def _tabela(linhas: list) -> str:
    if not linhas:
        return "(nenhuma linha)"
    cols = list(linhas[0].keys())
    larg = {c: min(40, max(len(c), *(len(str(l.get(c, ""))) for l in linhas))) for c in cols}
    fmt = lambda vals: " | ".join(str(v)[:40].ljust(larg[c]) for c, v in zip(cols, vals))
    return "\n".join([fmt(cols), "-+-".join("-" * larg[c] for c in cols)] + [fmt([l.get(c, "") for c in cols]) for l in linhas])


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    args = [a for a in sys.argv[1:] if a != "--tabela"]
    if not args:
        sys.exit(__doc__)
    resultado = consulta(args[0])
    print(_tabela(resultado) if "--tabela" in sys.argv else json.dumps(resultado, ensure_ascii=False, indent=1))
