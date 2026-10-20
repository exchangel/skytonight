#!/usr/bin/env python3
"""
build_catalog.py — Sitenin kullandığı data/catalog.json dosyasını üretir.

Kaynaklar:
  * OpenNGC (https://github.com/mattiaverga/OpenNGC, lisans CC-BY-SA 4.0):
    koordinat, tür, parlaklık (kadir) ve boyut bilgileri.
  * data/src/deepsky-tr.json: Türkçe adlar, açıklamalar, bulma tarifleri,
    ek NGC/IC cisimleri ve OpenNGC'deki eksik/hatalı değerlerin düzeltmeleri.
  * data/src/doubles.json ve data/src/stars.json: elle derlenmiş çift ve parlak yıldızlar.

Kullanım:
  python scripts/build_catalog.py
      OpenNGC dosyalarını .cache/openngc/ altına indirir (yoksa) ve kataloğu üretir.
  python scripts/build_catalog.py --openngc-dir YOL
      Önceden indirilmiş NGC.csv ve addendum.csv dosyalarını kullanır.

Katalog yalnızca kaynak verisi değiştiğinde yeniden üretilir; çıktısı repoya commit'lenir,
böylece site ve bildirim betiği çalışırken Python'a ihtiyaç duymaz.
"""

import argparse
import csv
import json
import sys
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "src"
OUT = ROOT / "data" / "catalog.json"
OPENNGC_URL = "https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/"
OPENNGC_FILES = ("NGC.csv", "addendum.csv")

# OpenNGC tür kodu → uygulamadaki tür
TYPE_MAP = {
    "G": "galaxy",
    "OCl": "open",
    "GCl": "globular",
    "PN": "planetary",
    "Neb": "nebula",
    "HII": "nebula",
    "RfN": "nebula",
    "EmN": "nebula",
    "Cl+N": "nebula",
    "SNR": "snr",
    "*Ass": "asterism",
    "Other": "asterism",
    "**": "double",
}

# OpenNGC Yılan takımyıldızını ikiye böler (Baş / Kuyruk); IAU tek kısaltma kullanır.
CONSTELLATION_FIX = {"Se1": "Ser", "Se2": "Ser"}


def parse_ra(text):
    """'HH:MM:SS.s' → saat (ondalıklı)."""
    h, m, s = text.split(":")
    return round(int(h) + int(m) / 60 + float(s) / 3600, 5)


def parse_dec(text):
    """'+DD:MM:SS.s' → derece (ondalıklı)."""
    sign = -1 if text.strip().startswith("-") else 1
    d, m, s = text.strip().lstrip("+-").split(":")
    return round(sign * (int(d) + int(m) / 60 + float(s) / 3600), 4)


def to_float(text):
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


CATALOG_PREFIXES = ("NGC", "IC", "Mel", "Cr")


def split_name(name):
    """'NGC0457' → ('NGC', 457); tanınmayan adlar için (None, None)."""
    for prefix in CATALOG_PREFIXES:
        rest = name[len(prefix):]
        if name.startswith(prefix) and rest.isdigit():
            return prefix, int(rest)
    return None, None


def object_id(name):
    """Kimlik: baştaki sıfırlar atılır → 'NGC457'."""
    prefix, number = split_name(name)
    return f"{prefix}{number}" if prefix else name


def display_code(name):
    """OpenNGC adını okunur yapar: 'NGC0457' → 'NGC 457', 'Mel111' → 'Mel 111'."""
    prefix, number = split_name(name)
    return f"{prefix} {number}" if prefix else name


def ensure_openngc(directory):
    directory.mkdir(parents=True, exist_ok=True)
    for fname in OPENNGC_FILES:
        target = directory / fname
        if not target.exists():
            print(f"İndiriliyor: {fname}")
            urllib.request.urlretrieve(OPENNGC_URL + fname, target)
    return directory


def load_openngc(directory):
    rows = {}
    for fname in OPENNGC_FILES:
        with open(directory / fname, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f, delimiter=";"):
                rows[row["Name"]] = row
    return rows


def magnitude(row, kind):
    """
    Görsel (V) kadir. V yoksa ya da tutarsızsa (galakside V > B olamaz) B kadirinden
    tahmin edilir: galaksiler için tipik B−V ≈ 0,7.
    """
    v = to_float(row["V-Mag"])
    b = to_float(row["B-Mag"])
    if kind == "galaxy" and b is not None and (v is None or v >= b):
        return round(b - 0.7, 2)
    if v is not None:
        return v
    return b


def size_of(row):
    major = to_float(row["MajAx"])
    minor = to_float(row["MinAx"])
    if major is None:
        return None
    return [major, minor] if minor else [major]


def from_openngc(row, object_id, code, alt_code=None):
    kind = TYPE_MAP.get(row["Type"])
    if kind is None:
        raise ValueError(f"Bilinmeyen tür {row['Type']} ({row['Name']})")
    obj = {
        "id": object_id,
        "code": code,
        "kind": kind,
        "ra": parse_ra(row["RA"]),
        "dec": parse_dec(row["Dec"]),
        "mag": magnitude(row, kind),
        "size": size_of(row),
        "con": CONSTELLATION_FIX.get(row["Const"], row["Const"]),
    }
    if alt_code:
        obj["altCode"] = alt_code
    return obj


def apply_text(obj, texts):
    """Türkçe ad, açıklama, tarif, uzaklık ve 'öne çıkan' bayrağını ekler."""
    t = texts.get(obj["id"], {})
    for key in ("name", "info", "tip", "distanceLy"):
        if key in t:
            obj[key] = t[key]
    obj["featured"] = bool(t.get("featured", False))
    return obj


def clean(obj):
    """Boş alanları at (JSON küçük kalsın)."""
    return {k: v for k, v in obj.items() if v is not None and v != [] and v is not False}


def build(openngc_dir):
    rows = load_openngc(openngc_dir)
    src = json.loads((SRC / "deepsky-tr.json").read_text(encoding="utf-8"))
    texts = src["objects"]
    overrides = src["overrides"]
    rename = src.get("rename", {})

    objects = []

    # 1) Messier kataloğu: OpenNGC'de 'M' sütunu dolu olan her kayıt.
    for name, row in rows.items():
        if not row["M"] or row["Type"] == "Dup":
            continue  # M102 tartışmalı bir kopya (Dup) kaydı; atlanır.
        m_number = int(row["M"])
        alt = display_code(name) if name.startswith(("NGC", "IC")) else None
        row = {**row}
        ov = overrides.get(name, {})
        if "kind" in ov:
            row["Type"] = next(k for k, v in TYPE_MAP.items() if v == ov["kind"])
        obj = from_openngc(row, f"M{m_number}", f"M{m_number}", alt)
        obj.update({k: v for k, v in ov.items() if k != "kind"})
        if "kind" in ov:
            obj["kind"] = ov["kind"]
        objects.append(apply_text(obj, texts))

    # 2) Seçilmiş ek NGC/IC/Melotte cisimleri.
    for name in src["include"]:
        row = rows[name]
        final_name = rename.get(name, name)
        obj = from_openngc(row, object_id(final_name), display_code(final_name))
        ov = overrides.get(name, {})
        obj.update(ov)
        objects.append(apply_text(obj, texts))

    # 3) OpenNGC'de tek kayıt olarak bulunmayan ya da birleştirilmiş cisimler.
    for m in src["manual"]:
        obj = {**m, "ra": parse_ra(m["ra"]), "dec": parse_dec(m["dec"])}
        objects.append(apply_text(obj, texts))

    # 4) Çift yıldızlar ve parlak yıldızlar.
    for fname, kind, prefix in (("doubles.json", "double", "double"), ("stars.json", "star", "star")):
        data = json.loads((SRC / fname).read_text(encoding="utf-8"))
        for s in data["objects"]:
            obj = {**s, "id": f"{prefix}:{s['id']}", "kind": kind, "ra": parse_ra(s["ra"]), "dec": parse_dec(s["dec"])}
            obj["featured"] = bool(s.get("featured", False))
            objects.append(obj)

    # Sağlamlık kontrolleri: her cismin kadiri olmalı, kimlikler tekil olmalı.
    ids = [o["id"] for o in objects]
    duplicates = {i for i in ids if ids.count(i) > 1}
    if duplicates:
        sys.exit(f"Tekrarlanan kimlikler: {sorted(duplicates)}")
    missing_mag = [o["id"] for o in objects if o.get("mag") is None]
    if missing_mag:
        sys.exit(f"Kadiri eksik cisimler (overrides'a ekle): {missing_mag}")
    unused_texts = set(texts) - set(ids)
    if unused_texts:
        sys.exit(f"Metni olup katalogda olmayan kimlikler: {sorted(unused_texts)}")

    def sort_key(o):
        if o["id"].startswith("M") and o["id"][1:].isdigit():
            return (0, int(o["id"][1:]), 0)
        return (1, 0, o["ra"])

    objects = [clean(o) for o in sorted(objects, key=sort_key)]
    return {
        "meta": {
            "generated": date.today().isoformat(),
            "count": len(objects),
            "sources": [
                "OpenNGC — Mattia Verga, CC-BY-SA 4.0 (https://github.com/mattiaverga/OpenNGC)",
                "Türkçe metinler, çift ve parlak yıldızlar: SkyTonight (elle derlendi)",
            ],
        },
        "objects": objects,
    }


def write(catalog):
    # Her cisim tek satırda: hem küçük dosya hem okunabilir git diff'leri.
    lines = ",\n".join("    " + json.dumps(o, ensure_ascii=False) for o in catalog["objects"])
    meta = json.dumps(catalog["meta"], ensure_ascii=False, indent=2).replace("\n", "\n  ")
    OUT.write_text(f'{{\n  "meta": {meta},\n  "objects": [\n{lines}\n  ]\n}}\n', encoding="utf-8")


def main():
    # Windows konsolunda Türkçe karakterler bozulmasın.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--openngc-dir", type=Path, help="NGC.csv ve addendum.csv'nin bulunduğu klasör")
    args = parser.parse_args()

    directory = args.openngc_dir or ensure_openngc(ROOT / ".cache" / "openngc")
    catalog = build(directory)
    write(catalog)

    kinds = {}
    for o in catalog["objects"]:
        kinds[o["kind"]] = kinds.get(o["kind"], 0) + 1
    messier = sum(1 for o in catalog["objects"] if o["id"].startswith("M") and o["id"][1:].isdigit())
    print(f"{OUT.relative_to(ROOT)} yazıldı: {catalog['meta']['count']} cisim ({messier} Messier)")
    print("Türlere göre:", ", ".join(f"{k}={v}" for k, v in sorted(kinds.items())))


if __name__ == "__main__":
    main()
