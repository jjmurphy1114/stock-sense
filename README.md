# StockSense

StockSense is a replay-analysis web app for Super Smash Bros. Melee `.slp` files. It combines a React frontend with a FastAPI backend to parse Slippi replays, extract gameplay stats, visualize where hits happened, and turn the results into lightweight coaching feedback.

## Features

### Single Replay Analysis

- Upload a single Slippi replay from the browser
- Parse match metadata including:
  - players
  - characters
  - winner
  - stocks remaining
  - stage
- Generate replay-specific coaching feedback

### Match Stats

- Match duration
- Total frames
- Total actions
- Players per frame

### Per-Player Stats

- L-cancel attempts, successes, and success rate
- Tech attempts, missed techs, and tech miss rate
- Tech direction split:
  - towards opponent
  - away from opponent
  - in place
- Actions per minute
- Ledge grabs
- Wavedashes
- Wavelands
- Attack vs movement ratio
- Openings won
- Kills secured
- Total damage inflicted
- Openings per kill
- Damage per opening
- Neutral win rate
- Average opening length
- Punishes faced and punish escapes

### Hit Graph

- Stage-based hit map view
- Hit markers positioned where percent increased
- Direction arrows estimating launch direction after a hit
- Sequential replay mode for watching hits appear in order
- Pause, resume, and show-all playback controls
- Player filtering on the graph
- Distinct stock-loss hit styling

### Multi-Replay Trend Tracking

- Upload a folder of `.slp` files
- Batch analysis across many replays
- Aggregate trends by detected Slippi identity
- Trend charts for:
  - L-cancel rate
  - Tech miss rate
  - Neutral win rate
  - Damage per opening
  - Actions per minute
- Replay-by-replay trend summaries

### Player Identification and Overrides

- Automatic player matching using:
  - Slippi connect code
  - netplay name
  - in-game nametag fallback
- Manual per-replay player assignment overrides
- Collapsible Player Assignment section for batch review

### Filters

- Filter trends by:
  - selected player tag
  - your character
  - opponent character

### UI Improvements

- Separate upload flows for:
  - single replay
  - replay folder
- Shared proper character display names across the app
- Consistent dropdown sizing
- Cleaner empty-state upload layout

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
├── src/
│   ├── components/
│   │   ├── ReplayAnalyzer.tsx
│   │   ├── StageHitMap.tsx
│   │   ├── TrendDashboard.tsx
│   │   └── replayAnalysisTypes.ts
│   ├── App.tsx
│   └── main.tsx
├── package.json
├── vite.config.ts
└── README.md
```

## Local Development

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

On Windows PowerShell:

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

## Backend API

### Single Replay

```http
POST /analyze
```

Upload a single `.slp` file as `multipart/form-data`.

### Batch Replay Analysis

```http
POST /analyze-batch
```

Upload multiple `.slp` files as `multipart/form-data` for trend tracking.

### Utility Endpoints

```http
GET /health
GET /docs
```

See [backend/README.md](backend/README.md) for backend-specific details.

## Deployment

Recommended deployment setup:

- frontend on Vercel
- backend on Render

### Frontend on Vercel

Deploy the repository root as a Vite project.

Set this environment variable in Vercel:

```bash
VITE_API_BASE_URL=https://your-render-backend.onrender.com
```

When this variable is set, the frontend sends replay uploads directly to the deployed backend. In local development, if the variable is not set, the app falls back to the local Vite proxy at `/api`.

### Backend on Render

Deploy the `backend/` directory as a Python Web Service.

Recommended Render settings:

```text
Root Directory: backend
Build Command: pip install -r requirements.txt
Start Command: uvicorn main:app --host 0.0.0.0 --port $PORT
```

After deployment, test:

- `/health`
- `/docs`
- replay upload from the deployed frontend

## Stock Icons

Character stock icons are loaded from:

```text
public/stock-icons/
```

If an icon is missing, the UI falls back to a small text badge automatically.

## Notes

- Replay parsing and some advanced gameplay stats are heuristic-based, not emulator-perfect
- Some interaction and punish metrics are approximations built from Slippi-exposed state data
- Batch trend tracking works best when the player’s Slippi identity is consistent across replays
- Manual player assignment is included for cases where automatic player detection is incomplete
- The app currently works best for standard 1v1 replay analysis

## Roadmap Ideas

- Better punish detection and combo segmentation
- Recovery and ledge-trap analysis
- Matchup-specific coaching summaries
- Saved replay history
- Shareable reports
- Stronger drill recommendations from trend data
