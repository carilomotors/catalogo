#!/usr/bin/env python3
"""Arma data/autos.json (lo que lee la web) a partir de:
   - data/ml.json     -> publicaciones de Mercado Libre (las baja el agente)
   - data/extra.json  -> vehículos que no están en ML (motos, etc.)
Uso: python3 tools/build_data.py
"""
import json, re, os, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
D = lambda *p: os.path.join(ROOT, *p)

# Código interno fijo por publicación de ML (se mantiene aunque cambie el precio)
CODES = {
    "MLA2279372103": "CM-0121", "MLA2279381471": "CM-0116", "MLA2295549363": "CM-0139",
    "MLA2257259167": "CM-0134", "MLA2279386877": "CM-0120", "MLA4185386096": "CM-0108",
    "MLA2229913687": "CM-0137", "MLA4099349402": "CM-0128", "MLA4099577252": "CM-0070",
    "MLA2279385335": "CM-0119", "MLA2297884153": "CM-0097", "MLA2297183523": "CM-0141",
    "MLA4208844936": "CM-0138", "MLA2279366195": "CM-0115", "MLA2297917241": "CM-0142",
    "MLA2298600915": "CM-0125", "MLA4099581652": "CM-0124", "MLA4187761760": "CM-0140",
    "MLA4099516934": "CM-0127", "MLA4210474446": "CM-0135", "MLA2281310447": "CM-0136",
}
TIPO_OVERRIDE = {"MLA2279381471": "suv"}  # WR-V
MARCA_FIX = {"Palio Weekend Adventure": ("Fiat", "Palio Weekend", "Adventure 1.6 16V")}

ML_IMG = "https://http2.mlstatic.com/D_NQ_NP_2X_{}-F.jpg"
FB_IMG = "https://firebasestorage.googleapis.com/v0/b/carilo-motors.firebasestorage.app/o/{}"

EQ_LABEL = {
    "Con cámara de retroceso": "Cámara de retroceso", "Airbag para conductor y pasajero": "Airbags frontales",
    "Cierre centralizado de puertas": "Cierre centralizado", "Comando remoto para radio en el volante": "Comandos al volante",
    "Porta equipaje en techo": "Barras de techo", "Soporte para rueda de auxilio": "Auxilio en portón",
    "Tercera luz de freno led": "Tercera luz de freno LED", "Con precio negociable": None, "Airbag conductor": None,
    "AM/FM": None, "Porta vasos": None, "Entrada auxiliar": None, "Desempañador trasero": "Desempañador trasero",
}
EQ_ORDER = ["Único dueño", "Tapizado de cuero", "Cámara de retroceso", "Sensor de estacionamiento", "Climatizador",
            "Piloto automático", "Control de estabilidad", "Tracción ASR", "Frenos ABS", "Airbags frontales",
            "Llantas de aleación", "Sensor de lluvia", "Bluetooth", "Comandos al volante", "Computadora de abordo",
            "Aire acondicionado", "Cristales eléctricos", "Cierre centralizado", "Alarma", "Barras de techo"]


def num(s):
    return int(re.sub(r"\D", "", s or "0") or 0)


def tipo_de(carroceria):
    c = (carroceria or "").lower()
    if "suv" in c: return "suv"
    if "pick" in c: return "pickup"
    if "moto" in c: return "moto"
    return "auto"


def eq_clean(lst):
    out = []
    for e in lst or []:
        e = EQ_LABEL.get(e, e)
        if e and e not in out:
            out.append(e)
    return sorted(out, key=lambda x: EQ_ORDER.index(x) if x in EQ_ORDER else 99)


def from_ml(r):
    a = r["a"]
    marca, modelo, version = a.get("Marca"), a.get("Modelo"), a.get("Versión", "")
    if modelo in MARCA_FIX:
        marca, modelo, version = MARCA_FIX[modelo]
    comb = a.get("Tipo de combustible", "").replace("Híbrido/Nafta", "Híbrido")
    return {
        "code": CODES.get(r["id"], "ML-" + r["id"][-6:]),
        "ml": r["id"],
        "marca": marca, "modelo": modelo, "version": version,
        "anio": int(a.get("Año", 0)), "km": num(a.get("Kilómetros")),
        "comb": comb, "caja": a.get("Transmisión"),
        "tipo": TIPO_OVERRIDE.get(r["id"], tipo_de(a.get("Tipo de carrocería"))),
        "carroceria": a.get("Tipo de carrocería"), "color": a.get("Color"), "puertas": a.get("Puertas"),
        "motor": a.get("Motor"), "potencia": a.get("Potencia"), "traccion": a.get("Control de tracción"),
        "direccion": r.get("dir"),
        "cur": r["cur"], "precio": r["p"], "permuta": r.get("perm"),
        "eq": eq_clean(r.get("eq")),
        "fotos": [ML_IMG.format(p) for p in r["pics"]],
        "texto": r.get("intro", ""),
        "gnc": "GNC" in comb,
    }


def from_extra(x):
    if x.get("img"):
        n, c = x["n"], x.get("cover", 1)
        order = [c] + [i for i in range(1, n + 1) if i != c]
        fotos = ["img/{}/{:02d}.jpg".format(x["img"], i) for i in order]
    else:
        fotos = [FB_IMG.format(u) for u in x.get("fb", [])]
    return {
        "code": x["code"], "ml": None,
        "marca": x["marca"], "modelo": x["modelo"], "version": x.get("version", ""),
        "anio": x["anio"], "km": x["km"], "comb": x["comb"], "caja": x["caja"], "tipo": x["tipo"],
        "carroceria": None, "color": x.get("color"), "puertas": None, "motor": None, "potencia": None,
        "traccion": None, "direccion": None,
        "cur": x["cur"], "precio": x["p"], "permuta": x.get("perm"),
        "eq": eq_clean(x.get("eq")), "fotos": fotos, "texto": x.get("texto", ""),
        "gnc": "GNC" in x["comb"],
    }


def main():
    ml = json.load(open(D("data", "ml.json"), encoding="utf-8"))
    extra = json.load(open(D("data", "extra.json"), encoding="utf-8"))
    autos = [from_ml(r) for r in ml if not r.get("pausada")] + [from_extra(x) for x in extra]
    seen = set()
    for v in autos:
        assert v["code"] not in seen, "código repetido " + v["code"]
        seen.add(v["code"])
    out = {
        "actualizado": datetime.datetime.now().strftime("%d/%m/%Y %H:%M"),
        "total": len(autos),
        "vehiculos": autos,
    }
    json.dump(out, open(D("data", "autos.json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("autos.json:", len(autos), "vehículos")


if __name__ == "__main__":
    main()
