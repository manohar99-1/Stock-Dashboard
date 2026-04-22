from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
import sqlite3, json, os
from datetime import datetime, timedelta
import yfinance as yf
import pandas as pd
import numpy as np

app = FastAPI(title="Stock Data Intelligence Dashboard", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = "stocks.db"

COMPANIES = {
    "RELIANCE": "RELIANCE.NS",
    "TCS": "TCS.NS",
    "INFY": "INFY.NS",
    "HDFCBANK": "HDFCBANK.NS",
    "WIPRO": "WIPRO.NS",
    "ICICIBANK": "ICICIBANK.NS",
    "SBIN": "SBIN.NS",
    "BAJFINANCE": "BAJFINANCE.NS",
    "HINDUNILVR": "HINDUNILVR.NS",
    "MARUTI": "MARUTI.NS",
}


def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS stock_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            date TEXT NOT NULL,
            open REAL,
            high REAL,
            low REAL,
            close REAL,
            volume INTEGER,
            daily_return REAL,
            ma7 REAL,
            UNIQUE(symbol, date)
        )
    """)
    conn.commit()
    conn.close()


def fetch_and_store(symbol: str):
    ticker = COMPANIES.get(symbol.upper())
    if not ticker:
        return False
    try:
        end = datetime.today()
        start = end - timedelta(days=365)
        df = yf.download(ticker, start=start.strftime("%Y-%m-%d"), end=end.strftime("%Y-%m-%d"), progress=False)
        if df.empty:
            return False

        df = df.reset_index()
        df.columns = [c[0] if isinstance(c, tuple) else c for c in df.columns]
        df = df.rename(columns={"Date": "date", "Open": "open", "High": "high",
                                  "Low": "low", "Close": "close", "Volume": "volume"})
        df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
        df = df.dropna(subset=["open", "close"])
        df["daily_return"] = (df["close"] - df["open"]) / df["open"] * 100
        df["ma7"] = df["close"].rolling(window=7).mean()
        df["symbol"] = symbol.upper()

        conn = sqlite3.connect(DB_PATH)
        for _, row in df.iterrows():
            conn.execute("""
                INSERT OR REPLACE INTO stock_data
                (symbol, date, open, high, low, close, volume, daily_return, ma7)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                row["symbol"], row["date"],
                round(float(row["open"]), 2), round(float(row["high"]), 2),
                round(float(row["low"]), 2), round(float(row["close"]), 2),
                int(row["volume"]) if not pd.isna(row["volume"]) else 0,
                round(float(row["daily_return"]), 4) if not pd.isna(row["daily_return"]) else None,
                round(float(row["ma7"]), 2) if not pd.isna(row["ma7"]) else None,
            ))
        conn.commit()
        conn.close()
        return True
    except Exception as e:
        print(f"Error fetching {symbol}: {e}")
        return False


def get_db_data(symbol: str, days: int = 365):
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cutoff = (datetime.today() - timedelta(days=days)).strftime("%Y-%m-%d")
    rows = conn.execute("""
        SELECT * FROM stock_data
        WHERE symbol = ? AND date >= ?
        ORDER BY date ASC
    """, (symbol.upper(), cutoff)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def ensure_data(symbol: str):
    data = get_db_data(symbol, days=7)
    if len(data) < 3:
        fetch_and_store(symbol)


@app.on_event("startup")
def startup():
    init_db()


# ── Endpoints ────────────────────────────────────────────────

@app.get("/companies", summary="List all available companies")
def get_companies():
    return [{"symbol": k, "ticker": v, "name": k} for k, v in COMPANIES.items()]


@app.get("/data/{symbol}", summary="Last 30 days of stock data")
def get_data(symbol: str):
    ensure_data(symbol)
    rows = get_db_data(symbol, days=30)
    if not rows:
        raise HTTPException(status_code=404, detail=f"No data found for {symbol}")
    return {"symbol": symbol.upper(), "count": len(rows), "data": rows}


@app.get("/summary/{symbol}", summary="52-week high, low, avg close + volatility score")
def get_summary(symbol: str):
    ensure_data(symbol)
    rows = get_db_data(symbol, days=365)
    if not rows:
        raise HTTPException(status_code=404, detail=f"No data found for {symbol}")
    closes = [r["close"] for r in rows if r["close"]]
    returns = [r["daily_return"] for r in rows if r["daily_return"] is not None]
    volatility = round(float(np.std(returns)), 4) if returns else None
    return {
        "symbol": symbol.upper(),
        "week52_high": max(r["high"] for r in rows),
        "week52_low": min(r["low"] for r in rows),
        "avg_close": round(sum(closes) / len(closes), 2),
        "latest_close": closes[-1],
        "volatility_score": volatility,
        "data_points": len(rows),
    }


@app.get("/compare", summary="Compare two stocks' performance")
def compare(
    symbol1: str = Query(..., example="TCS"),
    symbol2: str = Query(..., example="INFY"),
):
    ensure_data(symbol1)
    ensure_data(symbol2)
    d1 = get_db_data(symbol1, days=30)
    d2 = get_db_data(symbol2, days=30)
    if not d1:
        raise HTTPException(status_code=404, detail=f"No data for {symbol1}")
    if not d2:
        raise HTTPException(status_code=404, detail=f"No data for {symbol2}")

    def stats(rows, sym):
        closes = [r["close"] for r in rows]
        returns = [r["daily_return"] for r in rows if r["daily_return"] is not None]
        pct_change = round((closes[-1] - closes[0]) / closes[0] * 100, 2) if len(closes) > 1 else 0
        return {
            "symbol": sym.upper(),
            "latest_close": closes[-1],
            "30d_change_pct": pct_change,
            "avg_daily_return": round(sum(returns) / len(returns), 4) if returns else None,
            "volatility": round(float(np.std(returns)), 4) if returns else None,
            "dates": [r["date"] for r in rows],
            "closes": closes,
        }

    s1 = stats(d1, symbol1)
    s2 = stats(d2, symbol2)
    winner = s1["symbol"] if s1["30d_change_pct"] > s2["30d_change_pct"] else s2["symbol"]
    return {"stock1": s1, "stock2": s2, "better_performer_30d": winner}


@app.get("/predict/{symbol}", summary="Simple linear regression price prediction (next 7 days)")
def predict(symbol: str):
    ensure_data(symbol)
    rows = get_db_data(symbol, days=90)
    if len(rows) < 15:
        raise HTTPException(status_code=400, detail="Not enough data for prediction")
    closes = np.array([r["close"] for r in rows])
    x = np.arange(len(closes)).reshape(-1, 1)
    # Manual linear regression (no sklearn needed)
    x_mean, y_mean = x.mean(), closes.mean()
    slope = float(np.sum((x.flatten() - x_mean) * (closes - y_mean)) / np.sum((x.flatten() - x_mean) ** 2))
    intercept = float(y_mean - slope * x_mean)
    future_x = np.arange(len(closes), len(closes) + 7)
    predictions = [round(slope * xi + intercept, 2) for xi in future_x]
    last_date = datetime.strptime(rows[-1]["date"], "%Y-%m-%d")
    future_dates = [(last_date + timedelta(days=i+1)).strftime("%Y-%m-%d") for i in range(7)]
    return {
        "symbol": symbol.upper(),
        "model": "linear_regression",
        "predictions": [{"date": d, "predicted_close": p} for d, p in zip(future_dates, predictions)],
        "trend": "bullish" if slope > 0 else "bearish",
    }


@app.get("/gainers-losers", summary="Top 3 gainers and losers today")
def gainers_losers():
    results = []
    for symbol in COMPANIES:
        ensure_data(symbol)
        rows = get_db_data(symbol, days=5)
        if rows and rows[-1]["daily_return"] is not None:
            results.append({"symbol": symbol, "daily_return": rows[-1]["daily_return"],
                             "close": rows[-1]["close"], "date": rows[-1]["date"]})
    results.sort(key=lambda x: x["daily_return"], reverse=True)
    return {
        "top_gainers": results[:3],
        "top_losers": results[-3:][::-1],
    }
