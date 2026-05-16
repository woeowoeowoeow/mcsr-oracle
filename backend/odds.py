from math import comb

def to_odds(prob: float) -> float:
    """Odds are inverse of probability with a 5% house edge."""
    if prob <= 0: return 100.0
    return round(1 / (prob * 0.95), 2)

def bo5_prob(p: float) -> float:
    """Calculates the probability of winning a Best of 5 series."""
    q = 1 - p
    # p^3 (3-0) + 3*p^3*q (3-1) + 6*p^3*q^2 (3-2)
    return p**3 + 3*(p**3)*q + 6*(p**3)*(q**2)

def market_adjusted_prob(base_prob_a, money_a, money_b):
    """Blends model probability with market money for payout odds.
    Does NOT change the displayed probability — only affects payout calculation."""
    total_money = money_a + money_b
    if total_money == 0:
        return base_prob_a

    bet_ratio = money_a / total_money
    model_weight = 0.7
    return (base_prob_a * model_weight) + ((1 - bet_ratio) * (1 - model_weight))

def market_odds_a(base_prob_a, money_a, money_b):
    """Payout odds for side A, factoring in market money."""
    adj = market_adjusted_prob(base_prob_a, money_a, money_b)
    return to_odds(adj)

def market_odds_b(base_prob_a, money_a, money_b):
    """Payout odds for side B, factoring in market money."""
    adj = market_adjusted_prob(base_prob_a, money_a, money_b)
    return to_odds(1 - adj)