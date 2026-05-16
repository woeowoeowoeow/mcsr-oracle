import os
import time
import joblib
import pandas as pd
import numpy as np
import requests
from typing import Dict, Optional

# Constants from Spec
MCSR_API_BASE = "https://api.mcsrranked.com"
SPLIT_COLS = [
    "nether_enter", "bastion_enter", "fortress_enter", "bastion_loot",
    "blaze_rod", "blind_travel", "stronghold", "end_enter", "finish",
    "iron_tools", "lava_bucket"
]
TIMELINE_MAP = {
    "nether_enter":   "story.enter_the_nether",
    "bastion_enter":  "nether.find_bastion",
    "fortress_enter": "nether.find_fortress",
    "bastion_loot":   "nether.loot_bastion",
    "blaze_rod":      "nether.obtain_blaze_rod",
    "blind_travel":   "projectelo.timeline.blind_travel",
    "stronghold":     "story.follow_ender_eye",
    "end_enter":      "story.enter_the_end",
    "finish":         "projectelo.timeline.dragon_death",
    "iron_tools":     "story.iron_tools",
    "lava_bucket":    "story.lava_bucket",
}

class OracleModel:
    def __init__(self):
        # Paths assume files are in the backend/ directory
        base_path = os.path.dirname(__file__)
        self.model = joblib.load(os.path.join(base_path, "model.pkl"))
        self.scaler = joblib.load(os.path.join(base_path, "scaler.pkl"))
        df_feat = pd.read_parquet(os.path.join(base_path, "matchups_features.parquet"))
        self.feature_cols = [c for c in df_feat.columns if c.startswith("delta_")]

    def fetch_player_stats(self, uuid: str) -> Optional[Dict]:
        matches = []
        for season in [11, 10, 9]:
            resp = requests.get(f"{MCSR_API_BASE}/users/{uuid}/matches", params={
                "type": 2, "count": 50, "excludedecay": "true", "season": season
            })
            if resp.status_code == 200:
                data = resp.json().get("data", [])
                matches.extend(data)
            if len(matches) >= 50:
                break
        
        matches = matches[:50]
        if not matches: return None

        stats_accumulator = {col: [] for col in SPLIT_COLS}
        wins = []

        for m in matches:
            if m.get("forfeited") or not m.get("result", {}).get("uuid"):
                continue
            
            detail_resp = requests.get(f"{MCSR_API_BASE}/matches/{m['id']}")
            if detail_resp.status_code != 200: continue
            
            detail = detail_resp.json().get("data", {})
            timelines = {t["type"]: t["time"] for t in detail.get("timelines", []) if t["uuid"] == uuid}
            
            for col, api_key in TIMELINE_MAP.items():
                val = timelines.get(api_key)
                if val is not None:
                    stats_accumulator[col].append(val)
            
            wins.append(1 if m["result"]["uuid"] == uuid else 0)

        if not wins: return None

        res = {
            "win_rate": np.mean(wins),
            "completion_rate": len(stats_accumulator["finish"]) / len(matches) if matches else 0
        }
        for col in SPLIT_COLS:
            vals = stats_accumulator[col]
            res[f"{col}_mean"] = np.mean(vals) if vals else None
            res[f"{col}_std"] = np.std(vals) if vals else None
        
        return res

    def predict_base_prob(self, stats_a: Dict, stats_b: Dict) -> float:
        stat_keys = ["win_rate", "completion_rate"] + \
                    [f"{s}_{t}" for s in SPLIT_COLS for t in ["mean", "std"]]
        
        deltas = {}
        for key in stat_keys:
            val_a = stats_a.get(key)
            val_b = stats_b.get(key)
            if val_a is not None and val_b is not None:
                deltas[f"delta_{key}"] = val_a - val_b
            else:
                deltas[f"delta_{key}"] = 0.0

        X = pd.DataFrame([deltas])[self.feature_cols]
        X_scaled = self.scaler.transform(X)
        return float(self.model.predict_proba(X_scaled)[0][1])

    def get_series_breakdown(self, p: float, name_a: str, name_b: str):
        q = 1 - p
        outcomes = [
            {"label": f"{name_a} 3-0 {name_b}", "prob": p**3},
            {"label": f"{name_a} 3-1 {name_b}", "prob": 3*(p**3)*q},
            {"label": f"{name_a} 3-2 {name_b}", "prob": 6*(p**3)*(q**2)},
            {"label": f"{name_b} 3-0 {name_a}", "prob": q**3},
            {"label": f"{name_b} 3-1 {name_a}", "prob": 3*(q**3)*p},
            {"label": f"{name_b} 3-2 {name_a}", "prob": 6*(q**3)*(p**2)},
        ]
        # Sort by probability descending
        return sorted(outcomes, key=lambda x: x["prob"], reverse=True)

oracle = None

def get_oracle():
    global oracle
    if oracle is None:
        oracle = OracleModel()
    return oracle