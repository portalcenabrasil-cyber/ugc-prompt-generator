#!/usr/bin/env python3
"""
Compara Haiku vs Sonnet nos estilos: nano-veo-2, roupa-feminina-v2, serie.
Roda em localhost — sem toque em producao.
"""

import requests, base64, json, time
from datetime import datetime

BASE     = "http://localhost:3000"
EMAIL    = "portalcenabrasil@gmail.com"
PASS     = "99395215!Pee"
IMG_PATH = "C:/Users/phalm/AppData/Local/Temp/test-product.jpg"
OUT_FILE = "comparacao-haiku-vs-sonnet.txt"

PRICING = {
    'claude-sonnet-4-6':         (3.00,  15.00),
    'claude-haiku-4-5-20251001': (0.80,   4.00),
}

def login():
    r = requests.post(f"{BASE}/api/auth/login",
                      json={"email": EMAIL, "password": PASS})
    return r.json()["token"]

def load_image():
    with open(IMG_PATH, "rb") as f:
        return base64.b64encode(f.read()).decode()

def generate(token, endpoint, style, model=None, extra_fields=None):
    img_b64 = load_image()
    payload = {
        "image_base64": img_b64,
        "image_type":   "image/jpeg",
        "style":        style,
        "tipo":         "produto",
        "price":        "49.90",
        "gender":       "feminino",
        "duracao":      "30",
    }
    if model:
        payload["model"] = model
    if extra_fields:
        payload.update(extra_fields)

    t0 = time.time()
    r = requests.post(f"{BASE}{endpoint}", json=payload,
                      headers={"Authorization": f"Bearer {token}"},
                      timeout=300)
    elapsed = round((time.time() - t0) * 1000)

    if r.status_code != 200:
        return {"_error": r.text, "_elapsed_ms": elapsed}

    data = r.json()
    data["_elapsed_ms"] = elapsed
    return data

def calc_cost(model, inp, out):
    pi, po = PRICING.get(model, (3.00, 15.00))
    return (inp / 1_000_000) * pi + (out / 1_000_000) * po

def fmt(data, model_label, style):
    lines = []
    lines.append(f"  Modelo : {model_label}")
    lines.append(f"  Estilo : {style}")

    if "_error" in data:
        lines.append(f"  ERRO   : {data['_error'][:500]}")
        return "\n".join(lines)

    elapsed   = data.get("_elapsed_ms", "?")
    test_meta = data.get("_test", {})
    usage     = data.get("_usage", {})

    lines.append(f"  Tempo  : {elapsed}ms")

    if test_meta:
        inp  = test_meta.get("input_tokens", 0) or 0
        out  = test_meta.get("output_tokens", 0) or 0
        cost = test_meta.get("cost_usd", 0) or 0
    elif usage:
        inp  = usage.get("input_tokens", 0) or 0
        out  = usage.get("output_tokens", 0) or 0
        cost = calc_cost(model_label, inp, out)
    else:
        inp = out = cost = 0

    lines.append(f"  Tokens : in={inp} out={out}")
    lines.append(f"  Custo  : ${cost:.5f} USD")
    lines.append("")

    # Dump todos os campos retornados pela API (exclui chaves internas _*)
    for campo, val in data.items():
        if campo.startswith("_") or val is None or val == "" or val == [] or val == {}:
            continue
        if isinstance(val, list):
            val_str = "\n  ".join(str(v) for v in val)
        elif isinstance(val, dict):
            val_str = json.dumps(val, ensure_ascii=False, indent=2)
        else:
            val_str = str(val)
        val_str = val_str[:1600]
        lines.append(f"  [{campo.upper()}]")
        lines.append(f"  {val_str}")
        lines.append("")

    return "\n".join(lines)

def run_pair(token, style, extra_haiku=None, extra_sonnet=None, desc=""):
    """Roda Haiku (generate-test) e Sonnet (generate) para um estilo."""
    extra_h = extra_haiku or {}
    extra_s = extra_sonnet or extra_haiku or {}

    print(f"  -> Haiku...")
    haiku_data = generate(token, "/api/generate-test", style,
                          model="claude-haiku-4-5-20251001",
                          extra_fields=extra_h)

    print(f"  -> Sonnet...")
    sonnet_data = generate(token, "/api/generate", style,
                           extra_fields=extra_s)

    return haiku_data, sonnet_data

def main():
    print("Fazendo login...")
    token = login()
    print(f"Token OK: {token[:30]}...")

    # Campos extras para roupa-feminina-v2
    ROUPA_EXTRA = {
        "personagem_id": "CH-01",
        "cenario_id":    "A",        # A-muro-tijolos
        "modo":          "biblioteca",
    }

    testes = [
        ("nano-veo-2",        {},          {},          "Produto casa/lifestyle — 3 cenas Kling"),
        ("roupa-feminina-v2", ROUPA_EXTRA, ROUPA_EXTRA, "Roupa feminina — CH-01 Loira Californiana, Cenario A"),
        ("serie",             {},          {},          "Edredons Premium — prompt serie"),
    ]

    output_lines = []
    output_lines.append("=" * 72)
    output_lines.append("  COMPARACAO HAIKU vs SONNET — UGC.AI")
    output_lines.append(f"  Estilos: nano-veo-2 | roupa-feminina-v2 | serie")
    output_lines.append(f"  Gerado em: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    output_lines.append("=" * 72)
    output_lines.append("")
    output_lines.append("  Haiku recebe instrucao extra:")
    output_lines.append('  "Falas/legendas em PT-BR. Legendas com emojis UGC. Zero texto visual."')
    output_lines.append("  Sonnet: comportamento de producao padrao (sem instrucao extra).")
    output_lines.append("")

    resumo = []

    for style, extra_h, extra_s, desc in testes:
        print(f"\n[{style.upper()}] {desc}")
        haiku_data, sonnet_data = run_pair(token, style,
                                           extra_haiku=extra_h,
                                           extra_sonnet=extra_s,
                                           desc=desc)

        output_lines.append(f"{'=' * 72}")
        output_lines.append(f"  ESTILO: {style.upper()} — {desc}")
        output_lines.append(f"{'=' * 72}")
        output_lines.append("")

        output_lines.append(f"{'─' * 72}")
        output_lines.append(f"  HAIKU (claude-haiku-4-5-20251001)")
        output_lines.append(f"{'─' * 72}")
        output_lines.append(fmt(haiku_data, "claude-haiku-4-5-20251001", style))

        output_lines.append(f"{'─' * 72}")
        output_lines.append(f"  SONNET (claude-sonnet-4-6) — PRODUCAO")
        output_lines.append(f"{'─' * 72}")
        output_lines.append(fmt(sonnet_data, "claude-sonnet-4-6", style))

        # coleta dados p/ resumo
        h_meta = haiku_data.get("_test", {})
        h_cost = h_meta.get("cost_usd", 0) or 0
        h_time = haiku_data.get("_elapsed_ms", 0) or 0

        s_usage = sonnet_data.get("_usage", {})
        s_inp   = s_usage.get("input_tokens", 0) or 0
        s_out   = s_usage.get("output_tokens", 0) or 0
        s_cost  = calc_cost("claude-sonnet-4-6", s_inp, s_out)
        s_time  = sonnet_data.get("_elapsed_ms", 0) or 0

        ratio = f"{h_cost/s_cost:.2f}x" if s_cost > 0 else "n/a"
        speed = f"{h_time/s_time:.2f}x" if s_time > 0 else "n/a"

        resumo.append((style, h_time, h_cost, s_time, s_cost, ratio, speed))
        output_lines.append("")

    # Tabela resumo
    output_lines.append("=" * 72)
    output_lines.append("  RESUMO GERAL")
    output_lines.append("=" * 72)
    output_lines.append(f"  {'Estilo':<20} {'H.Tempo':>8} {'H.Custo':>10}  {'S.Tempo':>8} {'S.Custo':>10}  {'H/S custo':>10}  {'H/S speed':>10}")
    output_lines.append(f"  {'-'*20} {'-'*8} {'-'*10}  {'-'*8} {'-'*10}  {'-'*10}  {'-'*10}")
    for style, ht, hc, st, sc, ratio, speed in resumo:
        output_lines.append(
            f"  {style:<20} {ht:>7}ms ${hc:>8.5f}  {st:>7}ms ${sc:>8.5f}  {ratio:>10}  {speed:>10}"
        )

    output_lines.append("")
    output_lines.append("=" * 72)
    output_lines.append("  FIM DO RELATORIO")
    output_lines.append("=" * 72)

    result = "\n".join(output_lines)

    with open(OUT_FILE, "w", encoding="utf-8") as f:
        f.write(result)

    print(f"\nSalvo em: {OUT_FILE}")

if __name__ == "__main__":
    main()
