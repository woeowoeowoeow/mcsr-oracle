import os
import json
import requests
from datetime import datetime, timedelta
from threading import Lock
import time

from firebase_admin import firestore
from firebase import get_db
from odds import to_odds

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

# --- Constants ---
MCSR_API_BASE = "https://api.mcsrranked.com"
ADMIN_SECRET = os.getenv("ADMIN_SECRET") # This should be set in the environment
RETRY_SLEEP = 61 # Seconds to wait on 429 or other API issues

# --- Rate Limiting for MCSR API (copied from generate_bracket.py) ---
_lock = Lock()
_call_times = []

def rate_wait():
    with _lock:
        now = time.time()
        recent = [t for t in _call_times if now - t < 600] # 10 minutes window
        _call_times.clear()
        _call_times.extend(recent)
        if len(_call_times) >= 480: # 500 requests per 10 minutes, leave some buffer
            sleep_for = 600 - (now - _call_times[0])
            if sleep_for > 0:
                print(f"  Rate limit — sleeping {sleep_for:.0f}s...")
                time.sleep(sleep_for)
        _call_times.append(time.time())

def api_get(path, params=None):
    url = MCSR_API_BASE + path
    while True:
        rate_wait()
        resp = requests.get(url, params=params, timeout=15)
        if resp.status_code == 429:
            print(f"  429 — sleeping {RETRY_SLEEP}s...")
            time.sleep(RETRY_SLEEP)
            continue
        if resp.status_code != 200:
            print(f"  API Error {resp.status_code} for {url}")
            return None
        data = resp.json()
        if data.get("status") != "success":
            print(f"  API Response Status not success for {url}: {data.get('status')}")
            return None
        return data["data"]

# --- Settlement Logic ---
def settle_matchup(db, matchup_id: str, winner_uuid: str, winner_username: str):
    matchup_ref = db.collection("matchups").document(matchup_id)

    @firestore.transactional
    def update_in_transaction(transaction, matchup_ref):
        snapshot = matchup_ref.get(transaction=transaction)
        if not snapshot.exists:
            print(f"Matchup {matchup_id} not found for settlement.")
            return

        matchup_data = snapshot.to_dict()
        if matchup_data["status"] == "settled":
            print(f"Matchup {matchup_id} already settled.")
            return

        print(f"Settling matchup {matchup_id} with winner {winner_username}")

        # Update matchup status and winner
        transaction.update(matchup_ref, {
            "status": "settled",
            "winner": winner_username,
            "uuid_winner": winner_uuid,
            "settled_at": datetime.utcnow()
        })

        # Process bets
        bets_query = db.collection("bets").where("matchup_id", "==", matchup_id).where("settled", "==", False)
        bets = bets_query.get()

        for bet_doc in bets:
            bet_data = bet_doc.to_dict()
            user_ref = db.collection("users").document(bet_data["user_id"])

            payout_amount = 0.0
            if (bet_data["side"] == "a" and matchup_data["uuid_a"] == winner_uuid) or \
               (bet_data["side"] == "b" and matchup_data["uuid_b"] == winner_uuid):
                payout_amount = bet_data["amount"] * bet_data["odds_at_placement"]
                print(f"  User {bet_data['user_id']} won {payout_amount:.2f} on bet {bet_doc.id}")
                
                # Update user balance
                user_snapshot = user_ref.get(transaction=transaction)
                if user_snapshot.exists:
                    current_balance = user_snapshot.to_dict()["balance"]
                    transaction.update(user_ref, {"balance": current_balance + payout_amount})
            else:
                print(f"  User {bet_data['user_id']} lost bet {bet_doc.id}")

            # Update bet document
            transaction.update(bet_doc.reference, {
                "settled": True,
                "payout": payout_amount,
                "settled_at": datetime.utcnow()
            })
        print(f"Matchup {matchup_id} settlement complete.")

    transaction = db.transaction()
    update_in_transaction(transaction, matchup_ref)

def settle_parlays(db):
    """Check and settle parlays where all legs are finished."""
    parlays = db.collection("parlays").where("settled", "==", False).get()
    
    for parlay_doc in parlays:
        data = parlay_doc.to_dict()
        legs = data["legs"]
        
        all_legs_settled = True
        any_leg_lost = False
        
        for leg in legs:
            m_doc = db.collection("matchups").document(leg["matchup_id"]).get()
            m_data = m_doc.to_dict()
            
            if m_data["status"] != "settled":
                all_legs_settled = False
                break
            
            # Check if this leg won
            winner_uuid = m_data.get("uuid_winner")
            leg_side_uuid = m_data["uuid_a"] if leg["side"] == "a" else m_data["uuid_b"]
            
            if winner_uuid and winner_uuid != leg_side_uuid:
                any_leg_lost = True

        if all_legs_settled:
            won = not any_leg_lost
            payout = data["potential_payout"] if won else 0.0
            
            if won:
                user_ref = db.collection("users").document(data["user_id"])
                user_snap = user_ref.get()
                if user_snap.exists:
                    new_bal = user_snap.to_dict()["balance"] + payout
                    user_ref.update({"balance": new_bal})
            
            parlay_doc.reference.update({
                "settled": True,
                "won": won,
                "payout": payout,
                "settled_at": datetime.utcnow()
            })
            print(f"Parlay {parlay_doc.id} settled. Won: {won}")


def main():
    db = get_db()
    
    print(f"Settlement worker started at {datetime.utcnow()}")

    # 1. Fetch all matchups with status "open" or "closed"
    matchups_query = db.collection("matchups").where("status", "in", ["open", "closed"])
    matchups = matchups_query.get()

    for matchup_doc in matchups:
        matchup_data = matchup_doc.to_dict()
        matchup_id = matchup_doc.id
        player_a_uuid = matchup_data["uuid_a"]
        player_b_uuid = matchup_data["uuid_b"]
        player_a_name = matchup_data["player_a"]
        player_b_name = matchup_data["player_b"]

        print(f"Checking matchup {matchup_id}: {player_a_name} ({player_a_uuid}) vs {player_b_name} ({player_b_uuid})")

        found_winner_uuid = None
        found_winner_name = None

        # Fetch recent matches for player A and check for player B as opponent
        player_a_matches_resp = api_get(f"/users/{player_a_uuid}/matches", params={
            "type": 2, # Ranked matches
            "count": 20, # Look at recent 20 matches
            "excludedecay": "true"
        })

        if player_a_matches_resp:
            for match in player_a_matches_resp:
                if match.get("forfeited") or not match.get("result", {}).get("uuid"):
                    continue # Skip forfeited or unsettled matches

                if match.get("opponent_uuid") == player_b_uuid:
                    # Found a match between A and B
                    winner_uuid_in_match = match["result"]["uuid"]
                    if winner_uuid_in_match == player_a_uuid:
                        found_winner_uuid = player_a_uuid
                        found_winner_name = player_a_name
                        break
                    elif winner_uuid_in_match == player_b_uuid:
                        found_winner_uuid = player_b_uuid
                        found_winner_name = player_b_name
                        break
            
        if found_winner_uuid:
            settle_matchup(db, matchup_id, found_winner_uuid, found_winner_name)
        else:
            print(f"No completed match found for {player_a_name} vs {player_b_name} yet.")

    print("Checking parlays...")
    settle_parlays(db)

    print(f"Settlement worker finished at {datetime.utcnow()}")

if __name__ == "__main__":
    main()