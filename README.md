# StockSense

StockSense is a replay-analysis web app for Super Smash Bros. Melee `.slp` files. It combines a React frontend with a FastAPI backend to parse Slippi replays, extract gameplay stats, and turn them into lightweight coaching feedback.

## What It Does

- Upload a Slippi replay from the browser
- Parse player, stage, and match result metadata
- Show who won and how many stocks each player had left
- Extract execution, neutral, punish, and defensive stats
- Surface rule-based coaching insights from the replay

## Current Replay Stats

The app currently reports a mix of match-level and per-player stats.

### Match Info

- Stage
- Winner
- Stocks left
- Match duration
- Total frames
- Total actions
- Players per frame

### Per-Player Stats

- L-cancel attempts, successes, and rate
- Tech attempts, missed techs, and tech miss rate
- Tech direction split: left, right, in place
- Attack vs movement ratio
- Openings won
- Kills secured
- Total damage inflicted
- Openings per kill
- Damage per opening
- Neutral win rate
- Average opening length
- Defensive escape rate

### Coaching Feedback

The backend currently generates rule-based feedback around:

- pace and interaction level
- neutral control
- punish efficiency
- stock-closing efficiency
- disadvantage escapes
- execution issues like l-cancels and tech defense

## Tech Stack

- Frontend: React, TypeScript, Vite, Tailwind CSS
- Backend: FastAPI, py-slippi, Uvicorn

## Project Structure

```text
stocksense/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── services/
│   │   ├── feedback.py
│   │   ├── parser.py
│   │   └── stats.py
│   └── README.md
├── public/
│   └── stock-icons/
│       └── README.md
├── src/
│   └── components/
│       └── ReplayAnalyzer.tsx
├── package.json
└── README.md
```

## Getting Started

### 1. Install frontend dependencies

```bash
npm install
```

### 2. Set up the backend virtual environment

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd ..
```

On Windows PowerShell, activate with:

```powershell
backend\.venv\Scripts\Activate.ps1
```

### 3. Run the app

From the project root:

```bash
npm start
```

That starts:

- frontend on Vite
- backend on FastAPI

You can also run them separately:

```bash
npm run start:frontend
npm run start:backend
```

## Available Scripts

```bash
npm start
npm run dev
npm run start:frontend
npm run start:backend
npm run build
npm run lint
npm run preview
```

## Deployment

This project is set up for:

- frontend on Vercel
- backend on Railway

### Frontend on Vercel

Deploy the repository root as a Vite project.

Set this environment variable in Vercel:

```bash
VITE_API_BASE_URL=https://your-railway-backend.up.railway.app
```

When this variable is set, the frontend sends replay uploads directly to the
Railway backend. In local development, if the variable is not set, the app
falls back to the local Vite proxy at `/api`.

### Backend on Railway

Deploy the `backend/` directory as a Python service.

Recommended settings:

```text
Root Directory: backend
Install Command: pip install -r requirements.txt
Start Command: uvicorn main:app --host 0.0.0.0 --port $PORT
```

## Backend API

The main endpoint is:

```http
POST /analyze
```

Upload a `.slp` file as `multipart/form-data`.

The backend also exposes:

```http
GET /health
GET /docs
```

See [backend/README.md] for backend-specific details.

## Stock Icons

Character stock icons are loaded from:

```text
public/stock-icons/
```

Use the filenames listed in [public/stock-icons/README.md].

If an icon is missing, the UI falls back to a small text badge automatically.

## Notes

- The replay parsing and gameplay stats are heuristic-based, not emulator-perfect.
- Some advanced stats, especially tech and interaction segmentation, are approximations built from Slippi-exposed state data.
- The app currently works best for standard 1v1 replay analysis.

## Roadmap Ideas

- More reliable punish and tech detection
- Recovery and ledge-trap analysis
- Matchup-specific coaching
- Saved replay history
- ML-assisted weakness prediction
- Player trend analysis across many replays
