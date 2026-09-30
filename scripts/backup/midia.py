"""Espelho local das midias do Storage da Supabase (bucket crm-media), para o backup.

Lista os objetos em storage.objects com o usuario backup_leitura e baixa pela URL
publica so o que ainda nao esta em /opt/crm-backup/midia (ou mudou de tamanho).
Nada e apagado do espelho: midia removida no CRM continua no backup.
Chamado pelo backup.sh, que depois manda a pasta para o B2 com rclone.

Sai com erro se nao conseguir listar, ou se falhar mais de 20 downloads (ai e
problema de rede ou do Storage, nao de um arquivo solto).
"""
import json, os, subprocess, sys, urllib.error, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

DIR = "/opt/crm-backup"
ESPELHO = os.path.join(DIR, "midia")
BUCKET = "crm-media"
BASE = os.environ["SUPABASE_URL"].rstrip("/") + f"/storage/v1/object/public/{BUCKET}/"
LIMITE_FALHAS = 20

SQL = f"""select coalesce(json_agg(json_build_object('n', name, 's', (metadata->>'size')::bigint)), '[]')
          from storage.objects where bucket_id = '{BUCKET}'"""


def listar():
    r = subprocess.run(
        ["docker", "run", "--rm", "--network", "host", "-e", "PGPASSWORD", "postgres:17",
         "psql", "-h", os.environ["PGHOST"], "-U", os.environ["PGUSER"], "-d", "postgres",
         "--no-password", "-At", "-v", "ON_ERROR_STOP=1", "-c", SQL],
        capture_output=True, text=True, timeout=300)
    if r.returncode != 0:
        raise SystemExit(f"nao listou o storage: {r.stderr.strip()[:300]}")
    return json.loads(r.stdout)


def caminho_seguro(nome):
    partes = nome.split("/")
    if nome.startswith("/") or any(p in ("", ".", "..") for p in partes):
        return None
    return os.path.join(ESPELHO, *partes)


def baixar(obj):
    destino = caminho_seguro(obj["n"])
    if destino is None:
        return f"nome recusado: {obj['n']!r}"
    if os.path.exists(destino) and (obj["s"] is None or os.path.getsize(destino) == obj["s"]):
        return None
    os.makedirs(os.path.dirname(destino), exist_ok=True)
    temp = destino + ".parcial"
    url = BASE + urllib.parse.quote(obj["n"])
    try:
        with urllib.request.urlopen(url, timeout=120) as r, open(temp, "wb") as f:
            while bloco := r.read(1 << 16):
                f.write(bloco)
        os.replace(temp, destino)
        return "novo"
    except (urllib.error.URLError, OSError) as e:
        if os.path.exists(temp):
            os.remove(temp)
        return f"{obj['n']}: {e}"


def main():
    objetos = listar()
    with ThreadPoolExecutor(6) as pool:
        resultados = list(pool.map(baixar, objetos))
    novos = resultados.count("novo")
    falhas = [r for r in resultados if r not in (None, "novo")]
    for f in falhas[:30]:
        print("  falha:", f)
    print(f"midias: {len(objetos)} no storage, {novos} novas baixadas, {len(falhas)} falhas")
    return 1 if len(falhas) > LIMITE_FALHAS else 0


if __name__ == "__main__":
    sys.exit(main())
