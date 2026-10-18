#!/usr/bin/env python3
"""KZZ Football Live — static SEO page generator (ENGLISH-ONLY, 2026-10-18).

Reads predictions.json / news.json / analyses.json / teams_mm.json /
team_info.json in the site dir and generates indexable static pages
(all in English):

  news/<id>.html                 one per news item (latest 60)
  predictions/<date>-<slug>.html  one per league+date
  analyses/<id>.html             one per post-match analysis
  leagues/<slug>.html            9 league hub pages
  teams/<slug>.html              25 curated team pages

English-first: uses en_title/en_body (news, analyses), pick_en/en_reason
(predictions) when present, falling back to the Burmese fields so a page
is never empty. Cron workers MUST write English fields for new items
(see translate_missing_en.py).

Regenerates sitemap.xml with every page. Old dated pages (>30d for
predictions, beyond latest 60 for news) are pruned.

Run after any cron that updates the JSONs, BEFORE gh-pages-deploy.py.
"""
import html
import json
import os
import re
import sys
from datetime import date, timedelta

SITE = os.path.dirname(os.path.abspath(__file__))
BASE = "https://luuzoe.github.io/kzzfootballive"
ADS_CLIENT = "ca-pub-4388974491023298"
TODAY = date.today().isoformat()
PRUNE_BEFORE = (date.today() - timedelta(days=30)).isoformat()

LEAGUES = [
    ("premier-league", "Premier League", "🏴",
     "England's top flight — one of the most-watched leagues in the world, with a fierce title race every season."),
    ("la-liga", "La Liga", "🇪🇸",
     "Spain's top flight — long dominated by Real Madrid, Barcelona and Atlético Madrid, famous for its technical style of play."),
    ("serie-a", "Serie A", "🇮🇹",
     "Italy's top flight — renowned for defensive solidity and tactical football. Inter, AC Milan, Juventus and Napoli battle it out."),
    ("bundesliga", "Bundesliga", "🇩🇪",
     "Germany's top flight — huge crowds and plenty of goals. Bayern Munich usually lead the way, with Leverkusen and Dortmund challenging."),
    ("ligue-1", "Ligue 1", "🇫🇷",
     "France's top flight — PSG dominate, but it's a league where young stars break through. Monaco, Marseille and Lyon also feature."),
    ("eredivisie", "Eredivisie", "🇳🇱",
     "The Netherlands' top flight — Ajax, PSV and Feyenoord play open, attacking football and goals are common."),
    ("primeira-liga", "Primeira Liga", "🇵🇹",
     "Portugal's top flight — a three-way contest between Benfica, Porto and Sporting, and a production line of stars for Europe's biggest clubs."),
    ("champions-league", "Champions League", "⭐",
     "Europe's premier club competition — the top teams from every league compete for one trophy."),
    ("europa-league", "Europa League", "🟠",
     "Europe's second-tier club competition — teams fight hard for a Champions League qualification spot."),
]
LEAGUE_BY_NAME = {en: (slug, icon) for slug, en, icon, _ in LEAGUES}


def esc(s):
    return html.escape(str(s or ""), quote=True)


def paras(text):
    out = []
    for p in str(text or "").split("\n\n"):
        p = p.strip()
        if p:
            out.append("<p>" + esc(p).replace("\n", "<br>") + "</p>")
    return "\n".join(out)


def desc_of(text, n=150):
    t = re.sub(r"\s+", " ", str(text or "")).strip()
    return esc(t[:n])


def slugify(s):
    s = s.lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or "team"


def en_of(item, en_key, mm_key):
    """English field first, Burmese field as fallback (never empty)."""
    v = item.get(en_key)
    if v and str(v).strip():
        return v
    return item.get(mm_key, "")


ARTICLE_CSS = """
.article{max-width:760px;margin:0 auto;padding:16px}
.article h1{font-size:1.35rem;line-height:1.5;margin:8px 0}
.article .meta{color:#8aa392;font-size:.85rem;margin-bottom:12px}
.article p{line-height:1.85;margin:0 0 14px}
.crumbs{max-width:760px;margin:0 auto;padding:12px 16px 0;font-size:.85rem;color:#8aa392}
.crumbs a{color:#7fd79a}
.rel{margin-top:24px;border-top:1px solid #1e3a28;padding-top:12px}
.rel h2{font-size:1rem;margin-bottom:8px}
.rel ul{list-style:none;padding:0;margin:0}
.rel li{margin:6px 0}
.rel a{color:#b9f0c9}
.badge{display:inline-block;padding:2px 10px;border-radius:12px;font-size:.8rem;margin-right:6px}
.b-high{background:#14532d}.b-medium{background:#713f12}.b-low{background:#374151}
.prob{margin:8px 0}
.prob .row{display:flex;align-items:center;gap:8px;margin:4px 0;font-size:.85rem}
.prob .bar{height:8px;border-radius:4px;background:linear-gradient(90deg,#22c55e,#4ade80)}
.match{border:1px solid #1e3a28;border-radius:10px;padding:12px;margin:12px 0;background:#0f1f16}
.match h3{margin:0 0 6px;font-size:1.05rem}
"""

PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>__TITLE__ | KZZ Football Live</title>
<meta name="description" content="__DESC__">
<link rel="canonical" href="__CANON__">
<meta property="og:type" content="article">
<meta property="og:site_name" content="KZZ Football Live">
<meta property="og:title" content="__TITLE__">
<meta property="og:description" content="__DESC__">
<meta property="og:url" content="__CANON__">
<meta property="og:image" content="https://luuzoe.github.io/kzzfootballive/og-image.png">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⚽</text></svg>">
<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=__ADS__" crossorigin="anonymous"></script>
<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-JP9TEN30QK"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-JP9TEN30QK');
</script>
<div id="fb-root"></div>
<script async defer crossorigin="anonymous" src="https://connect.facebook.net/en_US/sdk.js#xfbml=1&version=v18.0"></script>
<link rel="stylesheet" href="/kzzfootballive/styles.css?v=27">
<style>__CSS__
.social-row{display:flex;gap:10px;align-items:center;margin:16px 0;flex-wrap:wrap}
.share-btn{background:#1a3a2a;border:1px solid #2d5a3d;color:#fff;padding:6px 12px;border-radius:6px;cursor:pointer;font-size:13px}
.share-btn:active{transform:scale(.97)}
.fb-comments{margin:12px 0}
</style>
<script>
function shareArticle(url, title){
  if(navigator.share){ navigator.share({title:title, url:url}).catch(()=>{}); }
  else { copyArticleLink(url); }
}
function copyArticleLink(url){
  navigator.clipboard.writeText(url).then(()=>alert('Link copied!')).catch(()=>prompt('Copy this link:', url));
}
</script>
</head>
<body>
<header class="site-header"><div class="header-inner"><div class="brand">
<a href="/" style="color:inherit;text-decoration:none;display:flex;align-items:center;gap:10px">
<span class="brand-ball">⚽</span><span><strong>KZZ Football Live</strong><br>
<span style="font-size:.8rem;color:#8aa392">Live Football — Scores • Predictions • News</span></span></a>
</div></div></header>
<nav class="crumbs">__CRUMBS__</nav>
<main class="content article">
<h1>__H1__</h1>
<div class="meta">__META__</div>
__BODY__
<div class="social-row">
  <div class="fb-like" data-href="__CANON__" data-width="" data-layout="button_count" data-action="like" data-size="small" data-share="false"></div>
  <button class="share-btn" onclick="shareArticle('__CANON__', document.title)">🔗 Share</button>
  <button class="share-btn" onclick="copyArticleLink('__CANON__')">📋 Copy Link</button>
</div>
<div class="fb-comments" data-href="__CANON__" data-width="100%" data-numposts="5"></div>
<div class="ad-slot"><ins class="adsbygoogle" style="display:block" data-ad-client="__ADS__" data-ad-format="auto" data-full-width-responsive="true"></ins>
<script>(adsbygoogle = window.adsbygoogle || []).push({});</script></div>
__RELATED__
</main>
<footer class="site-footer">
<p>__FOOTLINKS__</p>
<p><a href="/kzzfootballive/about.html">About</a> • <a href="/kzzfootballive/privacy.html">Privacy Policy</a></p>
<p>KZZ Football Analysis • Scores data — ESPN public API</p>
</footer>
</body></html>
"""

FOOTLINKS = " • ".join(
    '<a href="/kzzfootballive/leagues/%s.html">%s</a>' % (slug, en) for slug, en, _ic, _d in LEAGUES
)


def render(title, desc, canon, crumbs, h1, meta, body, related=""):
    p = PAGE
    p = p.replace("__TITLE__", esc(title)).replace("__DESC__", desc)
    p = p.replace("__CANON__", canon).replace("__CRUMBS__", crumbs)
    p = p.replace("__H1__", esc(h1)).replace("__META__", meta)
    p = p.replace("__BODY__", body).replace("__RELATED__", related)
    p = p.replace("__FOOTLINKS__", FOOTLINKS).replace("__CSS__", ARTICLE_CSS)
    p = p.replace("__ADS__", ADS_CLIENT)
    return p


def crumbs(*parts):
    # parts: [(label, url|None)]
    out = ['<a href="/kzzfootballive/">🏠 Home</a>']
    for label, url in parts:
        if url:
            out.append("› " + '<a href="%s">%s</a>' % (url, esc(label)))
        else:
            out.append("› " + esc(label))
    return " ".join(out)


def rel_block(title, links):
    if not links:
        return ""
    items = "\n".join('<li><a href="%s">%s</a></li>' % (u, esc(t)) for t, u in links)
    return '<div class="rel"><h2>%s</h2><ul>\n%s\n</ul></div>' % (esc(title), items)


def load(name, default):
    p = os.path.join(SITE, name)
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return default


def write(path, content):
    full = os.path.join(SITE, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8") as f:
        f.write(content)
    return "/" + path


def nid_of(n):
    return re.sub(r"[^a-z0-9\-]", "", str(n.get("id", ""))[:60].lower()) or "news"


def aid_of(a):
    return re.sub(r"[^a-z0-9\-]", "", str(a.get("id", ""))[:60].lower()) or "analysis"


def main():
    urls = [("/", TODAY, "hourly", "1.0"),
            ("/about.html", TODAY, "monthly", "0.5"),
            ("/privacy.html", TODAY, "monthly", "0.5"),
            ("/contact.html", TODAY, "monthly", "0.5"),
            ("/terms.html", TODAY, "monthly", "0.5")]

    news_d = load("news.json", {"news": []})
    pred_d = load("predictions.json", {"predictions": []})
    ana_d = load("analyses.json", {"analyses": []})
    team_info = load("team_info.json", {})

    news = sorted(news_d.get("news", []), key=lambda x: x.get("published", ""), reverse=True)[:60]
    analyses = ana_d.get("analyses", [])
    preds = pred_d.get("predictions", [])

    # ---------- news pages (English) ----------
    os.makedirs(os.path.join(SITE, "news"), exist_ok=True)
    for n in news:
        nid = nid_of(n)
        title = en_of(n, "title", "title_mm") or "News"
        body = paras(en_of(n, "body", "body_mm"))
        meta = "📰 %s • Source: %s" % (esc(n.get("published", "")[:10]), esc(n.get("source", "")))
        other = [(en_of(x, "title", "title_mm"), "/news/%s.html" % nid_of(x))
                 for x in news if x.get("id") != n.get("id")][:5]
        page = render(title, desc_of(en_of(n, "body", "body_mm")),
                      "%s/news/%s.html" % (BASE, nid),
                      crumbs(("News", "/kzzfootballive/#news"), (title[:60], None)),
                      title, meta, body,
                      rel_block("📰 More news", other))
        urls.append((write("news/%s.html" % nid, page), TODAY, "daily", "0.8"))

    # ---------- prediction pages (per league + date, English) ----------
    groups = {}
    for p in preds:
        slug = LEAGUE_BY_NAME.get(p.get("league", ""), (slugify(p.get("league", "league")), ""))[0]
        dkey = str(p.get("date", ""))[:10]
        groups.setdefault((dkey, slug, p.get("league", "")), []).append(p)
    os.makedirs(os.path.join(SITE, "predictions"), exist_ok=True)
    pred_pages = []
    for (dkey, slug, league_en), ms in sorted(groups.items()):
        ms.sort(key=lambda x: x.get("date", ""))
        _s, icon = LEAGUE_BY_NAME.get(league_en, (slug, "⚽"))
        cards = []
        for m in ms:
            ko = str(m.get("date", ""))[:16].replace("T", " ")
            conf = m.get("confidence", "")
            badge = {"high": ("b-high", "High confidence"), "medium": ("b-medium", "Medium confidence"),
                     "low": ("b-low", "Low confidence")}.get(conf, ("b-low", esc(conf)))
            probs = ""
            if all(k in m for k in ("prob_home", "prob_draw", "prob_away")):
                rows = []
                for lbl, v in (("Home (%s)" % m.get("home", ""), m["prob_home"]),
                               ("Draw", m["prob_draw"]),
                               ("Away (%s)" % m.get("away", ""), m["prob_away"])):
                    rows.append('<div class="row"><span style="min-width:120px">%s %s%%</span>'
                                '<span class="bar" style="width:%s%%"></span></div>' % (esc(lbl), v, v))
                probs = '<div class="prob">' + "".join(rows) + "</div>"
            cards.append(
                '<div class="match"><h3>%s 🆚 %s</h3>'
                '<div class="meta">🕐 %s (Yangon time, UTC+6:30) • <span class="badge %s">%s</span></div>'
                '<p><strong>Prediction:</strong> %s</p>%s%s</div>'
                % (esc(m.get("home", "")), esc(m.get("away", "")), esc(ko),
                   badge[0], badge[1], esc(en_of(m, "pick_en", "pick")), probs,
                   paras(en_of(m, "en_reason", "reason_mm"))))
        title = "%s %s Predictions (%s)" % (icon, league_en, dkey)
        body = "".join(cards) + "<p style='color:#8aa392;font-size:.85rem'>(Prediction only — never a guarantee.)</p>"
        fname = "predictions/%s-%s.html" % (dkey, slug)
        others = [(x[0], x[1]) for x in pred_pages if league_en in x[0]][-5:]
        page = render(title, desc_of(en_of(ms[0], "en_reason", "reason_mm")),
                      "%s/%s" % (BASE, fname),
                      crumbs(("Predictions", "/#predictions"), (title, None)),
                      title, "🔮 KZZ Football Analysis • %d matches" % len(ms), body,
                      rel_block("🔮 More %s predictions" % league_en, others))
        pred_pages.append((title, "/" + fname))
        urls.append((write(fname, page), TODAY, "daily", "0.8"))
    # prune prediction pages older than 30 days
    for fn in os.listdir(os.path.join(SITE, "predictions")):
        if re.match(r"^\d{4}-\d{2}-\d{2}-", fn) and fn[:10] < PRUNE_BEFORE:
            try:
                os.remove(os.path.join(SITE, "predictions", fn))
            except OSError:
                pass

    # ---------- analysis pages (English) ----------
    os.makedirs(os.path.join(SITE, "analyses"), exist_ok=True)
    for a in analyses:
        aid = aid_of(a)
        title = en_of(a, "en_title", "title_mm") or "Match analysis"
        score = "%s %d – %d %s" % (a.get("home", ""), a.get("home_score", 0),
                                   a.get("away_score", 0), a.get("away", ""))
        body = "<p><strong>Result:</strong> %s</p>" % esc(score) + paras(en_of(a, "en_body", "body_mm"))
        meta = "⚔️ %s • %s" % (esc(a.get("league", "")), esc(a.get("date", "")))
        other = [(en_of(x, "en_title", "title_mm"), "/analyses/%s.html" % aid_of(x))
                 for x in analyses if x.get("id") != a.get("id")][:5]
        page = render(title, desc_of(en_of(a, "en_body", "body_mm")),
                      "%s/analyses/%s.html" % (BASE, aid),
                      crumbs(("Analysis", "/kzzfootballive/#analyses"), (title[:60], None)),
                      title, meta, body,
                      rel_block("⚔️ More match analyses", other))
        urls.append((write("analyses/%s.html" % aid, page), TODAY, "weekly", "0.7"))

    # ---------- league hub pages (English) ----------
    os.makedirs(os.path.join(SITE, "leagues"), exist_ok=True)
    for slug, en, icon, blurb in LEAGUES:
        lp = [(t, u) for t, u in pred_pages if en in t]
        ln = []
        for n in news:
            blob = (str(n.get("title", "")) + " " + str(n.get("body", ""))).lower()
            if en.lower() in blob:
                ln.append((en_of(n, "title", "title_mm"), "/news/%s.html" % nid_of(n)))
            if len(ln) >= 5:
                break
        body = paras(blurb)
        body += ('<p>📊 <a href="/#standings">View standings</a> • '
                 '📅 <a href="/#fixtures">Fixtures</a> • ✅ <a href="/#results">Results</a> — '
                 'all live on the homepage.</p>')
        page = render("%s %s — Predictions, News, Results" % (icon, en), desc_of(blurb),
                      "%s/leagues/%s.html" % (BASE, slug),
                      crumbs((en, None)),
                      "%s %s" % (icon, en),
                      "KZZ Football Analysis • %s" % esc(en), body,
                      rel_block("🔮 %s predictions" % en, lp[:5]) +
                      rel_block("📰 %s news" % en, ln))
        urls.append((write("leagues/%s.html" % slug, page), TODAY, "weekly", "0.9"))

    # ---------- team pages (English) ----------
    os.makedirs(os.path.join(SITE, "teams"), exist_ok=True)
    for tid, info in team_info.items():
        en = info.get("name") or "Team %s" % tid
        tslug = slugify(en)
        trophies = "".join("<li>%s × %s</li>" % (esc(t["t"]), t["c"])
                           for t in info.get("trophies", []) if t.get("c"))
        body = ("<p><strong>City:</strong> %s • <strong>Founded:</strong> %s • "
                "<strong>Stadium:</strong> %s</p>"
                % (esc(info.get("city", "—")), esc(info.get("founded", "—")), esc(info.get("stadium", "—"))))
        if trophies:
            body += "<p><strong>🏆 Trophies:</strong></p><ul>" + trophies + "</ul>"
        tn = []
        for n in news:
            blob = (str(n.get("title", "")) + " " + str(n.get("body", ""))).lower()
            if en.lower() in blob:
                tn.append((en_of(n, "title", "title_mm"), "/news/%s.html" % nid_of(n)))
            if len(tn) >= 5:
                break
        page = render("%s — News & Predictions" % en, desc_of(body),
                      "%s/teams/%s.html" % (BASE, tslug),
                      crumbs((en, None)),
                      "⭐ %s" % esc(en),
                      "KZZ Football Analysis", body,
                      rel_block("📰 %s news" % en, tn))
        urls.append((write("teams/%s.html" % tslug, page), TODAY, "weekly", "0.7"))

    # ---------- sitemap ----------
    sm = ['<?xml version="1.0" encoding="UTF-8"?>',
          '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for loc, lastmod, freq, pri in urls:
        sm.append("  <url>\n    <loc>%s%s</loc>\n    <lastmod>%s</lastmod>\n"
                  "    <changefreq>%s</changefreq>\n    <priority>%s</priority>\n  </url>"
                  % (BASE, loc, lastmod, freq, pri))
    sm.append("</urlset>")
    with open(os.path.join(SITE, "sitemap.xml"), "w", encoding="utf-8") as f:
        f.write("\n".join(sm))

    print("OK: %d urls in sitemap (%d news, %d prediction pages, %d analyses, %d leagues, %d teams)"
          % (len(urls), len([u for u in urls if u[0].startswith("/news/")]),
             len([u for u in urls if u[0].startswith("/predictions/")]),
             len([u for u in urls if u[0].startswith("/analyses/")]),
             len([u for u in urls if u[0].startswith("/leagues/")]),
             len([u for u in urls if u[0].startswith("/teams/")])))


if __name__ == "__main__":
    sys.exit(main())
