#!/usr/bin/env python3
"""Add Dorgu Denmark story (Tier 2, site-only) to kzz-football-live news feed."""
import json, os, shutil, sys
from datetime import datetime
from zoneinfo import ZoneInfo

SITE = os.path.expanduser("~/workspace/your_files/kzz-football-live")
FB = os.path.expanduser("~/workspace/goals/monetize-goal-myanmar-youtube-channel/hidden_files/fb-football")
IMG = "news-2026-11-14-dorgu-denmark.jpg"
ID = "2026-11-14-dorgu-denmark"

now = datetime.now(ZoneInfo("Asia/Yangon")).strftime("%Y-%m-%dT%H:%M:%S+06:30")

entry = {
    "id": ID,
    "title": "Dorgu sent home by Denmark after failing fitness tests",
    "body": (
        "Manchester United defender Patrick Dorgu has been sent home by Denmark after failing fitness tests, "
        "ruling him out of the Nations League fixtures against Portugal and Norway. Denmark team doctor Morten Boesen "
        "confirmed on Friday that the 22-year-old was not ready to play in either game.\n\n"
        "\"We have carried out a series of tests on Dorgu, and he has not performed well enough to be ready to play "
        "in the two matches,\" Boesen said. \"He needs further recovery time after his injury, so we are sending him "
        "home for additional rehabilitation.\" Dorgu will continue his recovery at United's Carrington training base.\n\n"
        "The left-back only returned to action on Sunday, scoring a stoppage-time equaliser in United's dramatic 4-4 "
        "draw with Aston Villa, after a hamstring injury suffered against Wales in September kept him out for seven "
        "matches. It is not yet clear whether he will be fit for United's trip to Liverpool on 22 November, the first "
        "Premier League game of new head coach Mauricio Pochettino's reign."
    ),
    "title_mm": "ဒေါ်ဂူ ကြံ့ခိုင်မှု စစ်ဆေးမှု မအောင်လို့ ဒိန်းမတ်အသင်းက ပြန်လွှတ်",
    "body_mm": (
        "မန်ချက်စတာ ယူနိုက်တက် ဘယ်နောက်ခံလူ ပက်ထရစ် ဒေါ်ဂူကို ဒိန်းမတ် လက်ရွေးစင်အသင်းက သောကြာနေ့မှာ အသင်းကနေ ပြန်လွှတ်လိုက်ပါတယ်။ "
        "ကြံ့ခိုင်မှု စစ်ဆေးမှုတွေ မအောင်မြင်ခဲ့လို့ ပေါ်တူဂီနဲ့ နော်ဝေတို့နဲ့ ကစားမယ့် နေရှင်းလိဂ် ပွဲတွေမှာ ပါဝင်နိုင်မှာ မဟုတ်ဘူးလို့ ဒိန်းမတ် အသင်း ဆရာဝန် မော်တင် ဘိုးဆင်က ပြောခဲ့ပါတယ်။\n\n"
        "ဒေါ်ဂူဟာ စက်တင်ဘာလက ဝေလအသင်းနဲ့ ပွဲမှာ ရရှိခဲ့တဲ့ ပေါင်နောက်ကြော ဒဏ်ရာကနေ ပြန်လည် သက်သာလာဖို့ အချိန် ထပ်လိုနေသေးတယ်လို့ ဘိုးဆင်က ပြောခဲ့ပါတယ်။ "
        "စစ်ဆေးမှုတွေ အများအပြား ပြုလုပ်ခဲ့ပေမယ့် လိုအပ်တဲ့ အဆင့်ကို မရောက်ခဲ့လို့ ကာရင်တန်မှာ ပြန်လည် ကုသမှု ခံယူဖို့ ယူနိုက်တက်ထံ ပြန်လွှတ်ခဲ့တာ ဖြစ်ပါတယ်။\n\n"
        "အသက် ၂၂ နှစ်အရွယ် ဒေါ်ဂူဟာ ဒဏ်ရာကြောင့် ပွဲအတော်များများ လွဲချော်ခဲ့ပြီးနောက် တနင်္ဂနွေနေ့က အက်စတွန် ဗီလာနဲ့ ၄ ဂိုးစီ သရေကျခဲ့တဲ့ ပွဲမှာ ပြန်လည် ကစားခဲ့ပြီး နောက်ဆုံး မိနစ်မှာ ချေပဂိုး သွင်းယူခဲ့ပါတယ်။ "
        "ဒါပေမယ့် နိုဝင်ဘာ ၂၂ ရက်နေ့ လီဗာပူးနဲ့ ကစားမယ့် ပွဲမှာ သူ ပါဝင်နိုင်မလား ဆိုတာကတော့ မသေချာသေးပါဘူး။ ယူနိုက်တက် နည်းပြသစ် မော်ရစ်စီယို ပိုချက်တီနိုအတွက်တော့ ဒါဟာ စိတ်ပျက်စရာ သတင်းတစ်ခု ဖြစ်ပါတယ်။"
    ),
    "image": IMG,
    "source": "Danish FA",
    "published": now,
    "fb_url": "",
    "tier": 2,
}

# Burmese corruption scan: no codepoints in 0x0900-0x0DFF outside Myanmar block
for key in ("title_mm", "body_mm"):
    bad = [c for c in entry[key] if 0x0900 <= ord(c) <= 0x0DFF and not (0x1000 <= ord(c) <= 0x109F)]
    assert not bad, f"Tamil/other Indic codepoints in {key}: {[hex(ord(c)) for c in bad]}"
assert ":" not in entry["title_mm"] and "：" not in entry["body_mm"]

# 1. copy image into site folder
shutil.copyfile(os.path.join(FB, IMG), os.path.join(SITE, IMG))

# 2. update news.json: prepend, cap 20, drop oldest + delete its image
path = os.path.join(SITE, "news.json")
data = json.load(open(path, encoding="utf-8"))
items = data["news"]
assert all(e["id"] != ID for e in items), "duplicate id"
items.insert(0, entry)
dropped = items[20:]
items[:] = items[:20]
json.dump(data, open(path, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
for e in dropped:
    img = os.path.join(SITE, e.get("image", ""))
    if e.get("image") and os.path.exists(img):
        os.remove(img)
        print("deleted dropped image:", e["image"])
print("dropped:", [e["id"] for e in dropped])
print("news count now:", len(items), "| top:", items[0]["id"], "| published:", now)

# 3. log in posted.json under "news" (site-only)
ppath = os.path.join(FB, "posted.json")
posted = json.load(open(ppath, encoding="utf-8"))
posted.setdefault("news", {})[ID] = {
    "published": now,
    "title": entry["title"],
    "source": entry["source"],
    "fb_url": "",
    "tier": 2,
}
json.dump(posted, open(ppath, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("posted.json updated")
