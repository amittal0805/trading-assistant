# Trading Assistant (v1)

Personal trading assistant for Indian (Zerodha · NSE/BSE) and US (Vested · NYSE/NASDAQ) markets. Dark-mode trading-terminal UI, all calculations net of brokerage and statutory charges.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## What's included (v1)

- **Dashboard** — realized/unrealized P/L, charges today, capital used, available cash, portfolio cards (INR + USD), capital & risk settings
- **Intraday Assistant** — required exit price for a target net profit (iterative solver, charges + slippage), quantity calculator, daily profit goal planner with risk:reward
- **Positions** — intraday positions with live net P/L after charges, close at price, convert to delivery (moves to Holdings)
- **Holdings** — manual holdings with inline price updates, long-term/swing tagging
- **Dip Buying / Smart Averaging** — conservative/balanced/aggressive ladders, new average, recovery targets, exposure warnings
- **Scalping** — partial profit booking from holdings, effective average, buy-back plan at -2/-3/-5%
- **Brokerage Calculator** — Zerodha intraday/delivery full breakdown (brokerage, STT, exchange, SEBI, GST, stamp), Vested (SEC fee, FINRA TAF)
- **Trade Journal** — reason, emotion, mistakes, learning, win rate & avg win/loss stats

Data is stored locally in your browser (localStorage). No backend, no login, no API keys needed.

## Charge rates

Defaults live in `lib/charges.ts` (`DEFAULT_ZERODHA`, `DEFAULT_VESTED`). Rates change — verify against your broker's published schedule and edit there.

## Roadmap (from PRD, not yet built)

Live market data (Kite Connect / Polygon / Finnhub), watchlist with indicators, sector & index dashboards, market sentiment, news, AI trade suggestions, reports/PDF export, notifications, auth + backend (NestJS/Postgres), mobile apps.

> Informational tool only — not investment advice.
