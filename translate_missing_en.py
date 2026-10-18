#!/usr/bin/env python3
"""KZZ Football Live — English-field gap checker / applier.

The site is ENGLISH-ONLY (2026-10-18). Every content item in
news.json / predictions.json / analyses.json must carry English fields:

  news:        "title" + "body"        (English; "title_mm"/"body_mm" = Burmese)
  predictions: "pick_en" + "en_reason" (English; "pick"/"reason_mm" = Burmese)
  analyses:    "en_title" + "en_body"  (English; "title_mm"/"body_mm" = Burmese)

Usage:
  python3 translate_missing_en.py
      List items in scope (latest 60 news, predictions from last 30 days,
      analyses from last 30 days) that are missing English fields.
      Exits 1 if any are missing, 0 if all complete.

  python3 translate_missing_en.py --apply /tmp/en_translations.json
      Merge English fields from a JSON file shaped like:
      {"news": {"<id>": {"title": "...", "body": "..."}, ...},
       "predictions": [{"pick_en": "...", "en_reason": "..."}, ...],   # array order = predictions.json order
       "analyses": {"<id>": {"en_title": "...", "en_body": "..."}, ...}}
      Writes the fields back into the JSON files in the site dir.

Cron workers: after appending new items to the JSONs, write the English
fields yourself (you are an LLM — translate the Burmese you just wrote),
then run this script WITHOUT --apply to confirm nothing is missing,
then run build_static_pages.py and deploy.
"""
import json
import os
import sys
from datetime import date, timedelta

SITE = os.path.dirname(os.path.abspath(__file__))
CUTOFF = (date.today() - timedelta(days=30)).isoformat()


def load(name):
    with open(os.path.join(SITE, name), encoding="utf-8") as f:
        return json.load(f)


def save(name, data):
    p = os.path.join(SITE, name)
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, p)


def has(v):
    return bool(v and str(v).strip())


def missing_report():
    missing = {"news": [], "predictions": [], "analyses": []}
    news = sorted(load("news.json").get("news", []),
                  key=lambda x: x.get("published", ""), reverse=True)[:60]
    for n in news:
        need = []
        if not has(n.get("title")):
            need.append("title")
        if not has(n.get("body")):
            need.append("body")
        if need:
            missing["news"].append({"id": n.get("id"), "missing": need,
                                    "title_mm": str(n.get("title_mm", ""))[:80]})
    for i, p in enumerate(load("predictions.json").get("predictions", [])):
        if str(p.get("date", ""))[:10] < CUTOFF:
            continue
        need = []
        if not has(p.get("pick_en")):
            need.append("pick_en")
        if not has(p.get("en_reason")):
            need.append("en_reason")
        if need:
            missing["predictions"].append(
                {"index": i, "missing": need,
                 "match": "%s vs %s %s" % (p.get("home"), p.get("away"), str(p.get("date", ""))[:10])})
    for a in load("analyses.json").get("analyses", []):
        if str(a.get("date", "")) < CUTOFF:
            continue
        need = []
        if not has(a.get("en_title")):
            need.append("en_title")
        if not has(a.get("en_body")):
            need.append("en_body")
        if need:
            missing["analyses"].append({"id": a.get("id"), "missing": need,
                                        "title_mm": str(a.get("title_mm", ""))[:80]})
    return missing


def apply_file(path):
    with open(path, encoding="utf-8") as f:
        t = json.load(f)
    n_applied = 0

    nd = load("news.json")
    by_id = {n.get("id"): n for n in nd.get("news", [])}
    for nid, fields in (t.get("news") or {}).items():
        n = by_id.get(nid)
        if not n:
            print("WARN: news id not found: %s" % nid)
            continue
        for k in ("title", "body"):
            if has(fields.get(k)):
                n[k] = fields[k]
                n_applied += 1
    save("news.json", nd)

    pd = load("predictions.json")
    plist = t.get("predictions") or []
    if isinstance(plist, list):
        for p, fields in zip(pd.get("predictions", []), plist):
            for k in ("pick_en", "en_reason"):
                if has(fields.get(k)):
                    p[k] = fields[k]
                    n_applied += 1
    elif isinstance(plist, dict):
        print("WARN: predictions translations must be an order-matched array; dict ignored")
    save("predictions.json", pd)

    ad = load("analyses.json")
    aby_id = {a.get("id"): a for a in ad.get("analyses", [])}
    for aid, fields in (t.get("analyses") or {}).items():
        a = aby_id.get(aid)
        if not a:
            print("WARN: analysis id not found: %s" % aid)
            continue
        for k in ("en_title", "en_body"):
            if has(fields.get(k)):
                a[k] = fields[k]
                n_applied += 1
    save("analyses.json", ad)
    print("Applied %d English fields." % n_applied)


def main():
    if len(sys.argv) > 2 and sys.argv[1] == "--apply":
        apply_file(sys.argv[2])
        return 0
    m = missing_report()
    total = sum(len(v) for v in m.values())
    if total == 0:
        print("OK: all in-scope items have English fields.")
        return 0
    print("MISSING English fields (%d items):" % total)
    print(json.dumps(m, ensure_ascii=False, indent=1))
    print("\nFill them (translate the Burmese you wrote), re-run to confirm, "
          "then run build_static_pages.py.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
