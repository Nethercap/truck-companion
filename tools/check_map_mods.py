"""Estado de los datos de mapa: versiones upstream de los mods y archivos en R2.

Lee docs/data/map-manifest.json (fuente de verdad, se edita a mano al
publicar) y escribe docs/data/map-mods-status.json con:
  - por mod: la version publicada upstream (si la pagina se puede leer y el
    patron matchea), comparada con la nuestra -> ok / outdated / unknown
  - por variante: tamano y fecha de cada archivo en R2 (HEAD)
El panel de admin (docs/admin.html) muestra las dos cosas. Lo corre el
workflow .github/workflows/map-mods-check.yml una vez por semana (y a mano);
con --discord <webhook> avisa si algo quedo desactualizado.

Uso:  python tools/check_map_mods.py [--discord URL] [--quiet]
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "docs", "data", "map-manifest.json")
STATUS = os.path.join(ROOT, "docs", "data", "map-mods-status.json")
UA = "Mozilla/5.0 (compatible; TruckDash-mapcheck/1.0; +https://trucksim-dash.com)"


def fetch(url: str, method: str = "GET", timeout: int = 25):
    req = urllib.request.Request(url, method=method, headers={"User-Agent": UA})
    return urllib.request.urlopen(req, timeout=timeout)


def version_tuple(v: str):
    # "1.20c" > "1.20b": una letra final cuenta como un componente mas (a=1, b=2...)
    nums = [int(x) for x in re.findall(r"\d+", v or "")]
    m = re.search(r"\d([a-z])$", (v or "").strip())
    if m:
        nums.append(ord(m.group(1)) - 96)
    return tuple(nums)


def check_mod(mod: dict) -> dict:
    ours = mod.get("version")
    out = {"ours": ours, "upstream": None, "status": "unknown", "error": None, "source": None}
    check = mod.get("check")
    if not check:
        out["status"] = "manual"
        out["error"] = mod.get("checkNote")
        return out
    out["source"] = check["url"]
    try:
        with fetch(check["url"]) as resp:
            html = resp.read().decode("utf-8", errors="ignore")
        found = re.findall(check["pattern"], html)
        if not found:
            out["error"] = "el patron no matcheo (cambio la pagina?)"
            return out
        # la version mas alta que aparezca en la pagina (las paginas de mods listan historial)
        upstream = max(found, key=version_tuple)
        out["upstream"] = upstream
        if not ours:
            out["status"] = "planned"
        elif version_tuple(upstream) > version_tuple(ours):
            out["status"] = "outdated"
        else:
            out["status"] = "ok"
    except Exception as exc:
        out["error"] = f"{type(exc).__name__}: {exc}"[:160]
    return out


def head_file(base: str, key: str, map_data_version: str) -> dict:
    url = f"{base}/{key}?v={map_data_version}"
    try:
        with fetch(url, method="HEAD") as resp:
            size = int(resp.headers.get("Content-Length") or 0)
            modified = resp.headers.get("Last-Modified")
            return {"ok": True, "bytes": size, "lastModified": modified}
    except Exception as exc:
        return {"ok": False, "error": f"{type(exc).__name__}: {exc}"[:120]}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--discord", default=os.environ.get("DISCORD_ADMIN_WEBHOOK_URL") or None)
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    manifest = json.load(open(MANIFEST, encoding="utf-8"))
    base = manifest["r2Base"].rstrip("/")
    status = {"checkedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "mods": {}, "variants": {}}

    for mod_id, mod in manifest["mods"].items():
        status["mods"][mod_id] = check_mod(mod)
        r = status["mods"][mod_id]
        if not args.quiet:
            print(f"  {mod['name']:34s} nuestra {str(r['ours']):10s} upstream {str(r['upstream']):10s} {r['status']}" + (f"  ({r['error']})" if r["error"] else ""))

    for var_id, var in manifest["variants"].items():
        if var.get("planned"):
            status["variants"][var_id] = {"files": {}, "totalBytes": 0, "allOk": True, "planned": True}
            continue
        files = {key: head_file(base, key, var.get("mapDataVersion", "")) for key in var.get("files", [])}
        total = sum(f.get("bytes", 0) for f in files.values())
        status["variants"][var_id] = {"files": files, "totalBytes": total, "allOk": all(f.get("ok") for f in files.values())}
        if not args.quiet:
            print(f"  {var_id:14s} {total / 1e6:7.1f} MB  " + ("ok" if status["variants"][var_id]["allOk"] else "FALTAN ARCHIVOS"))

    json.dump(status, open(STATUS, "w", encoding="utf-8"), indent=2, ensure_ascii=False)
    print(f"escrito {STATUS}")

    outdated = [(manifest["mods"][m]["name"], r) for m, r in status["mods"].items() if r["status"] == "outdated"]
    missing = [v for v, s in status["variants"].items() if not s["allOk"]]
    if args.discord and (outdated or missing):
        lines = [f"- **{name}**: tenemos {r['ours']}, upstream {r['upstream']}" for name, r in outdated]
        lines += [f"- variante **{v}**: faltan archivos en R2" for v in missing]
        body = {"content": "🗺️ **Datos de mapa** — hay algo para actualizar:\n" + "\n".join(lines) + "\nPanel: https://trucksim-dash.com/admin.html"}
        try:
            req = urllib.request.Request(args.discord, data=json.dumps(body).encode("utf-8"), method="POST",
                                         headers={"Content-Type": "application/json", "User-Agent": UA})
            urllib.request.urlopen(req, timeout=15).close()
        except Exception as exc:
            print(f"aviso a Discord fallo: {exc}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
