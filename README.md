# Stock Data Intelligence Dashboard

A full-stack financial data platform built with FastAPI + React. Fetches real NSE stock data via yfinance, stores in SQLite, and displays interactive charts with ML price prediction.

## Features
- Real-time NSE stock data (10 companies)
- REST API with Swagger docs at `/docs`
- Metrics: Daily Return, 7-Day MA, 52-Week High/Low, Volatility Score
- Linear regression price prediction (next 7 days)
- Top Gainers/Losers dashboard
- Stock comparison tool
- Dark theme React frontend with Chart.js

## Tech Stack
- **Backend:** FastAPI, yfinance, SQLite, Pandas, NumPy
- **Frontend:** React, Vite, Chart.js, Axios
- **Deployment:** Render (backend), Vercel (frontend)

## Setup

### Backend
```bash
pip install -r requirements.txt
uvicorn main:app --reload
# API docs: http://localhost:8000/docs
