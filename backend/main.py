import os
from fastapi import FastAPI, HTTPException, Header
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from typing import List, Optional
import requests
import httpx
from datetime import datetime
from jose import jwt, JWTError

from firebase import get_db
from model import get_oracle, MCSR_API_BASE
from odds import to_odds, bo5_prob, market_adjusted_prob
from dotenv import load_dotenv
load_dotenv()

app = FastAPI(title="MCSR Oracle API")
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

ADMIN_SECRET = os.getenv("ADMIN_SECRET", "dev-secret")

# --- Discord OAuth setup ---
"""
Discord app setup:
1. Go to https://discord.com/developers/applications
2. Create a new application
3. Go to OAuth2 -> add redirect URI: http://localhost:8000/auth/discord/callback
4. Copy the Client ID and Client Secret into backend .env
5. For production, also add the Render callback URL:
   https://your-render-url.onrender.com/auth/discord/callback
"""

DISCORD_CLIENT_ID = os.getenv("DISCORD_CLIENT_ID")
DISCORD_CLIENT_SECRET = os.getenv("DISCORD_CLIENT_SECRET")
DISCORD_REDIRECT_URI = os.getenv("DISCORD_REDIRECT_URI")
JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET:
    raise ValueError("JWT_SECRET environment variable must be set")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")

# --- Schemas ---

class BetRequest(BaseModel):
    matchup_id: str
    side: str
    amount: float
    bet_type: str = "winner"
    predicted_outcome: Optional[str] = None

class ParlayLeg(BaseModel):
    matchup_id: str
    side: str
    odds_at_placement: float

class ParlayRequest(BaseModel):
    amount: float
    legs: List[ParlayLeg]

class LinkMcsrRequest(BaseModel):
    mcsr_username: str

class MatchupCreate(BaseModel):
    player_a: str
    player_b: str
    season: int

# --- Helpers ---

def compute_starting_balance(data: dict) -> float:
    stats = data.get("statistics", {})
    current = stats.get("season", {}).get("playedMatches", {}).get("ranked", 0)
    total = stats.get("total", {}).get("playedMatches", {}).get("ranked", 0)
    older = max(0, total - current)
    raw = current * 10 + older * 2
    return min(max(raw, 500), 5000)

def verify_jwt(authorization: str = None):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    token = authorization.replace("Bearer ", "")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=["HS256"])
        return payload["user_id"]
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

# --- Auth Endpoints ---

@app.get("/auth/discord/login")
async def discord_login():
    params = {
        "client_id": DISCORD_CLIENT_ID,
        "redirect_uri": DISCORD_REDIRECT_URI,
        "response_type": "code",
        "scope": "identify"
    }
    url = "https://discord.com/api/oauth2/authorize?" + "&".join(f"{k}={v}" for k, v in params.items())
    return RedirectResponse(url)

@app.get("/auth/discord/callback")
async def discord_callback(code: str):
    async with httpx.AsyncClient() as client:
        token_resp = await client.post("https://discord.com/api/oauth2/token", data={
            "client_id": DISCORD_CLIENT_ID,
            "client_secret": DISCORD_CLIENT_SECRET,
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": DISCORD_REDIRECT_URI
        })
        token_data = token_resp.json()
        access_token = token_data["access_token"]

        user_resp = await client.get("https://discord.com/api/users/@me",
            headers={"Authorization": f"Bearer {access_token}"})
        discord_user = user_resp.json()
        discord_id = discord_user["id"]
        discord_username = discord_user["username"]

    print(f"[DEBUG] Discord ID: {discord_id}")
    print(f"[DEBUG] Discord username: {discord_username}")

    db = get_db()
    existing = db.collection("users").where("discord_id", "==", discord_id).limit(1).get()

    if existing:
        print("[DEBUG] User found in Firestore")
        user_doc = existing[0]
        user_data = user_doc.to_dict()
        user_id = user_doc.id
    else:
        print("[DEBUG] Creating new Discord-only user (no MCSR link yet)")
        new_user = {
            "discord_id": discord_id,
            "discord_username": discord_username,
            "mcsr_uuid": None,
            "mcsr_username": None,
            "balance": 0,
            "created_at": datetime.utcnow()
        }
        _, doc_ref = db.collection("users").add(new_user)
        user_id = doc_ref.id
        user_data = new_user

    token = jwt.encode({
        "user_id": user_id,
        "discord_id": discord_id,
        "exp": datetime.utcnow().timestamp() + 86400 * 30
    }, JWT_SECRET, algorithm="HS256")

    return RedirectResponse(f"{FRONTEND_URL}/auth/callback?token={token}")

@app.post("/auth/link-mcsr")
async def link_mcsr(req: LinkMcsrRequest, authorization: str = Header(None)):
    user_id = verify_jwt(authorization)
    db = get_db()

    user_doc = db.collection("users").document(user_id).get()
    if not user_doc.exists:
        raise HTTPException(status_code=404, detail="User not found")
    user_data = user_doc.to_dict()
    discord_id = user_data.get("discord_id")
    if not discord_id:
        raise HTTPException(status_code=400, detail="No Discord ID linked to this account")

    print(f"[DEBUG] link-mcsr: looking up MCSR username '{req.mcsr_username}' for Discord ID {discord_id}")

    mcsr_resp = requests.get(f"{MCSR_API_BASE}/users/{req.mcsr_username}")
    print(f"[DEBUG] link-mcsr: MCSR API status={mcsr_resp.status_code}")

    if mcsr_resp.status_code != 200:
        raise HTTPException(status_code=400, detail="MCSR username not found")

    mcsr_data = mcsr_resp.json().get("data", {})
    connections = mcsr_data.get("connections", {})
    discord_connection = connections.get("discord", {})

    print(f"[DEBUG] link-mcsr: connections.discord = {discord_connection}")

    linked_discord_id = discord_connection.get("id") if isinstance(discord_connection, dict) else discord_connection

    if str(linked_discord_id) != str(discord_id):
        raise HTTPException(status_code=400, detail="Your Discord account is not linked to this MCSR username. Go to mcsrranked.com and link your Discord under account settings, then try again.")

    mcsr_uuid = mcsr_data.get("uuid")
    mcsr_username = mcsr_data.get("nickname")
    current_season_games = mcsr_data.get("statistics", {}).get("season", {}).get("playedMatches", {}).get("ranked", 0)
    total_games = mcsr_data.get("statistics", {}).get("total", {}).get("playedMatches", {}).get("ranked", 0)
    older_games = total_games - current_season_games
    starting_balance = min(5000, max(500, (current_season_games * 10) + (older_games * 2)))

    db.collection("users").document(user_id).update({
        "mcsr_uuid": mcsr_uuid,
        "mcsr_username": mcsr_username,
        "balance": starting_balance,
        "linked_at": datetime.utcnow()
    })

    print(f"[DEBUG] link-mcsr: linked successfully — uuid={mcsr_uuid}, username={mcsr_username}, balance={starting_balance}")

    updated = db.collection("users").document(user_id).get().to_dict()
    updated["id"] = user_id
    return updated

@app.get("/auth/me")
async def get_me(authorization: str = Header(None)):
    user_id = verify_jwt(authorization)
    db = get_db()
    user = db.collection("users").document(user_id).get()
    if not user.exists:
        raise HTTPException(status_code=404, detail="User not found")
    return {"id": user_id, **user.to_dict()}

# --- Matchup Endpoints ---

@app.get("/matchups")
async def get_matchups():
    db = get_db()
    matchups = db.collection("matchups").get()
    res = []
    for m in matchups:
        data = m.to_dict()
        data["id"] = m.id
        curr_p = data.get("current_prob_a", data["base_prob_a"])
        money_a = data.get("money_a", 0)
        money_b = data.get("money_b", 0)
        data["odds_a"] = to_odds(curr_p)
        data["odds_b"] = to_odds(1 - curr_p)
        data["bo5_a"] = bo5_prob(curr_p)
        data["bo5_b"] = 1 - data["bo5_a"]
        res.append(data)
    return res

@app.get("/matchups/{matchup_id}")
async def get_matchup(matchup_id: str):
    db = get_db()
    oracle = get_oracle()
    doc = db.collection("matchups").document(matchup_id).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Matchup not found")

    data = doc.to_dict()
    data["id"] = doc.id
    curr_p = data.get("current_prob_a", data["base_prob_a"])

    data["odds_a"] = to_odds(curr_p)
    data["odds_b"] = to_odds(1 - curr_p)
    data["bo5_a"] = bo5_prob(curr_p)
    data["bo5_b"] = 1 - data["bo5_a"]
    data["breakdown"] = oracle.get_series_breakdown(curr_p, data["player_a"], data["player_b"])
    return data

# --- Bet Endpoints ---

@app.post("/bets")
async def place_bet(req: BetRequest, authorization: str = Header(None)):
    user_id = verify_jwt(authorization)
    db = get_db()

    matchup_ref = db.collection("matchups").document(req.matchup_id)
    matchup = matchup_ref.get()
    if not matchup.exists:
        raise HTTPException(status_code=404, detail="Matchup not found")

    m_data = matchup.to_dict()
    if m_data["status"] != "open":
        raise HTTPException(status_code=400, detail="Betting is closed")

    user_ref = db.collection("users").document(user_id)
    user = user_ref.get()
    if not user.exists or user.to_dict()["balance"] < req.amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")

    base_p = m_data["base_prob_a"]
    money_a = m_data.get("money_a", 0)
    money_b = m_data.get("money_b", 0)

    user_ref.update({"balance": user.to_dict()["balance"] - req.amount})

    curr_p = m_data.get("current_prob_a", base_p)
    odds_at_placement = to_odds(curr_p) if req.side == "a" else to_odds(1 - curr_p)

    bet_doc = {
        "user_id": user_id,
        "matchup_id": req.matchup_id,
        "side": req.side,
        "amount": req.amount,
        "bet_type": req.bet_type,
        "predicted_outcome": req.predicted_outcome,
        "odds_at_placement": odds_at_placement,
        "settled": False,
        "payout": 0,
        "created_at": datetime.utcnow()
    }
    _, bet_ref = db.collection("bets").add(bet_doc)

    new_money_a = money_a + (req.amount if req.side == "a" else 0)
    new_money_b = money_b + (req.amount if req.side == "b" else 0)
    new_prob_a = market_adjusted_prob(base_p, new_money_a, new_money_b)

    matchup_ref.update({
        "money_a": new_money_a,
        "money_b": new_money_b,
        "current_prob_a": new_prob_a,
    })

    return {
        "bet_id": bet_ref.id,
        "odds": odds_at_placement,
        "potential_payout": round(req.amount * odds_at_placement, 2)
    }

@app.get("/users/{user_id}/balance")
async def get_balance(user_id: str, authorization: str = Header(None)):
    verify_jwt(authorization)
    db = get_db()
    user = db.collection("users").document(user_id).get()
    if not user.exists:
        raise HTTPException(status_code=404, detail="User not found")
    return {"balance": user.to_dict()["balance"]}

@app.post("/parlays")
async def place_parlay(req: ParlayRequest, authorization: str = Header(None)):
    user_id = verify_jwt(authorization)
    db = get_db()
    user_ref = db.collection("users").document(user_id)
    user = user_ref.get()
    if not user.exists or user.to_dict()["balance"] < req.amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")

    total_odds = 1.0
    legs_data = []
    for leg in req.legs:
        total_odds *= to_odds(leg.odds_at_placement)
        legs_data.append(leg.dict())

    user_ref.update({"balance": user.to_dict()["balance"] - req.amount})

    parlay_doc = {
        "user_id": user_id,
        "legs": legs_data,
        "amount": req.amount,
        "total_odds": total_odds,
        "potential_payout": req.amount * total_odds,
        "settled": False,
        "won": False,
        "payout": 0,
        "created_at": datetime.utcnow()
    }
    _, parlay_ref = db.collection("parlays").add(parlay_doc)
    return {"parlay_id": parlay_ref.id, "total_odds": total_odds}

@app.get("/parlays/{user_id}")
async def get_user_parlays(user_id: str, authorization: str = Header(None)):
    verify_jwt(authorization)
    db = get_db()
    parlays = db.collection("parlays").where("user_id", "==", user_id).order_by("created_at", direction="DESCENDING").get()
    return [p.to_dict() | {"id": p.id} for p in parlays]

@app.get("/bets/recent")
async def get_recent_bets(limit: int = 20):
    db = get_db()
    bets = db.collection("bets").order_by("created_at", direction="DESCENDING").limit(limit).get()
    res = []
    for b in bets:
        bet_data = b.to_dict()
        bet_data["id"] = b.id
        m_doc = db.collection("matchups").document(bet_data["matchup_id"]).get()
        if m_doc.exists:
            m_data = m_doc.to_dict()
            bet_data["matchup"] = {
                "player_a": m_data["player_a"],
                "player_b": m_data["player_b"],
                "uuid_a": m_data["uuid_a"],
                "uuid_b": m_data["uuid_b"],
            }
        u_doc = db.collection("users").document(bet_data["user_id"]).get()
        if u_doc.exists:
            u_data = u_doc.to_dict()
            bet_data["username"] = u_data.get("mcsr_username") or u_data.get("discord_username", "Unknown")
        res.append(bet_data)
    return res

@app.get("/matchups/{matchup_id}/bets")
async def get_matchup_bets(matchup_id: str, limit: int = 20):
    db = get_db()
    bets = db.collection("bets").where("matchup_id", "==", matchup_id).order_by("created_at", direction="DESCENDING").limit(limit).get()
    res = []
    for b in bets:
        bet_data = b.to_dict()
        bet_data["id"] = b.id
        u_doc = db.collection("users").document(bet_data["user_id"]).get()
        if u_doc.exists:
            u_data = u_doc.to_dict()
            bet_data["username"] = u_data.get("mcsr_username") or u_data.get("discord_username", "Unknown")
            bet_data["mcsr_uuid"] = u_data.get("mcsr_uuid")
        res.append(bet_data)
    return res

@app.get("/bets/{user_id}")
async def get_user_bets(user_id: str, authorization: str = Header(None)):
    verify_jwt(authorization)
    db = get_db()
    bets = db.collection("bets").where("user_id", "==", user_id).order_by("created_at", direction="DESCENDING").get()
    res = []
    for b in bets:
        bet_data = b.to_dict()
        bet_data["id"] = b.id
        m_doc = db.collection("matchups").document(bet_data["matchup_id"]).get()
        if m_doc.exists:
            m_data = m_doc.to_dict()
            bet_data["matchup"] = {
                "player_a": m_data["player_a"],
                "player_b": m_data["player_b"],
                "uuid_a": m_data["uuid_a"],
                "uuid_b": m_data["uuid_b"],
                "status": m_data["status"],
                "winner": m_data.get("winner")
            }
        res.append(bet_data)
    return res

@app.get("/leaderboard")
async def get_leaderboard():
    db = get_db()
    users = db.collection("users").order_by("balance", direction="DESCENDING").limit(50).get()
    all_bets = db.collection("bets").get()
    bets_by_user = {}
    for b in all_bets:
        bd = b.to_dict()
        uid = bd["user_id"]
        if uid not in bets_by_user:
            bets_by_user[uid] = []
        bets_by_user[uid].append(bd)

    res = []
    for u in users:
        ud = u.to_dict()
        user_bets = bets_by_user.get(u.id, [])
        settled = [b for b in user_bets if b.get("settled")]
        wins = sum(1 for b in settled if b.get("payout", 0) > 0)
        losses = sum(1 for b in settled if b.get("payout", 0) == 0)
        total_bet = sum(b.get("amount", 0) for b in settled)
        total_payout = sum(b.get("payout", 0) for b in settled)
        roi = ((total_payout - total_bet) / total_bet * 100) if total_bet > 0 else 0
        res.append({
            "id": u.id,
            "username": ud.get("mcsr_username") or ud.get("discord_username", "Unknown"),
            "mcsr_uuid": ud.get("mcsr_uuid", ""),
            "balance": ud["balance"],
            "wins": wins,
            "losses": losses,
            "roi": round(roi, 1)
        })
    return res

@app.post("/admin/matchups")
async def create_matchup(req: MatchupCreate, secret: str = ""):
    if secret != ADMIN_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")
    
    db = get_db()
    oracle = get_oracle()

    resp_a = requests.get(f"{MCSR_API_BASE}/users/{req.player_a}").json()
    resp_b = requests.get(f"{MCSR_API_BASE}/users/{req.player_b}").json()
    uuid_a, name_a = resp_a["data"]["uuid"], resp_a["data"]["nickname"]
    uuid_b, name_b = resp_b["data"]["uuid"], resp_b["data"]["nickname"]

    stats_a = oracle.fetch_player_stats(uuid_a)
    stats_b = oracle.fetch_player_stats(uuid_b)
    if not stats_a or not stats_b:
        raise HTTPException(status_code=400, detail="Insufficient data for players")

    base_prob_a = oracle.predict_base_prob(stats_a, stats_b)

    new_matchup = {
        "season": req.season,
        "player_a": name_a, "player_b": name_b,
        "uuid_a": uuid_a, "uuid_b": uuid_b,
        "base_prob_a": base_prob_a, "current_prob_a": base_prob_a,
        "money_a": 0, "money_b": 0,
        "status": "open", "winner": None, "created_at": datetime.utcnow()
    }
    _, doc_ref = db.collection("matchups").add(new_matchup)
    return {"id": doc_ref.id, **new_matchup}

@app.on_event("startup")
async def startup_check():
    required = ["FIREBASE_CREDENTIALS_JSON", "DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET",
                "DISCORD_REDIRECT_URI", "JWT_SECRET", "ADMIN_SECRET", "FRONTEND_URL"]
    for var in required:
        val = os.getenv(var)
        print(f"{'✓' if val else '✗'} {var}: {'set' if val else 'MISSING'}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
