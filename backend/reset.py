import os
import requests
from dotenv import load_dotenv
load_dotenv()

from firebase import get_db

MCSR_API_BASE = "https://api.mcsrranked.com"

def compute_starting_balance(username):
    try:
        resp = requests.get(f"{MCSR_API_BASE}/users/{username}", timeout=15)
        if resp.status_code != 200:
            print(f"  Warning: API returned {resp.status_code} for {username}, falling back to 1000")
            return 1000
        data = resp.json()["data"]
        stats = data.get("statistics", {})
        current = stats.get("season", {}).get("playedMatches", {}).get("ranked", 0)
        total = stats.get("total", {}).get("playedMatches", {}).get("ranked", 0)
        older = max(0, total - current)
        raw = current * 10 + older * 2
        return min(max(raw, 500), 5000)
    except Exception as e:
        print(f"  Warning: failed to fetch {username} ({e}), falling back to 1000")
        return 1000

db = get_db()

# Delete all bets
bets = db.collection("bets").get()
for bet in bets:
    bet.reference.delete()
print(f"Deleted {len(bets)} bets")

# Reset user balances
users = db.collection("users").get()
for user in users:
    ud = user.to_dict()
    username = ud.get("username", "")
    balance = compute_starting_balance(username)
    user.reference.update({"balance": balance})
    print(f"  {username}: {balance} coins")
print(f"Reset {len(users)} user balances")

# Reset matchup odds
matchups = db.collection("matchups").get()
for matchup in matchups:
    data = matchup.to_dict()
    matchup.reference.update({
        "money_a": 0,
        "money_b": 0,
        "current_prob_a": data["base_prob_a"],
        "status": "open",
        "winner": None
    })
print(f"Reset {len(matchups)} matchups")

print("Done.")
