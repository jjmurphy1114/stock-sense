# StockSense Backend API

A minimal FastAPI backend for analyzing Super Smash Bros. Melee replays using Slippi data.

## Features

- **File Upload Endpoint**: `POST /analyze` - Upload .slp replay files
- **Replay Parsing**: Extracts player info, characters, stage, and frame data
- **Basic Stats**: Total frames, action count, match duration, player engagement
- **Coaching Feedback**: Rule-based feedback for improving gameplay

## Tech Stack

- **FastAPI** - Modern web framework
- **py-slippi** - Slippi replay file parser
- **Uvicorn** - ASGI server
- **Python 3.8+**

## Installation

1. **Create and activate a virtual environment** (optional but recommended):

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```

2. **Install dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

## Running the Server

From inside `backend/`:

```bash
./.venv/bin/python -m uvicorn main:app --reload
```

From the project root:

```bash
backend/.venv/bin/python -m uvicorn backend.main:app --reload
```

The API will be available at `http://localhost:8000`

- **Interactive Docs**: http://localhost:8000/docs
- **Health Check**: http://localhost:8000/health

## API Endpoints

### Health Check

```
GET /health
```

Returns server status.

### Analyze Replay

```
POST /analyze
```

Upload a .slp file and receive analysis.

**Request**:

```
Content-Type: multipart/form-data
file: <.slp file>
```

**Response**:

```json
{
  "stats": {
    "total_frames": 1800,
    "total_actions": 450,
    "match_duration_seconds": 30.0,
    "players_per_frame": 2.0
  },
  "feedback": [
    "🟢 Good action intensity! You're maintaining active gameplay.",
    "✓ Match duration is typical for competitive play.",
    "💪 Excellent pace! You're keeping the game moving."
  ],
  "summary": "Replay analysis complete.",
  "metadata": {
    "players": [
      {
        "player_index": 0,
        "character": "FOX",
        "nametag": "Player1",
        "is_cpu": false
      }
    ],
    "num_players": 2,
    "stage": "FINAL_DESTINATION"
  }
}
```

## Project Structure

```
backend/
├── main.py                 # FastAPI application
├── services/
│   ├── __init__.py
│   ├── parser.py          # Slippi replay file parsing
│   ├── stats.py           # Stats extraction
│   └── feedback.py        # Coaching feedback generation
├── temp/                  # Temporary uploaded files
├── requirements.txt       # Python dependencies
├── .gitignore
└── README.md
```

## Development Notes

- **File Upload**: .slp files are temporarily stored in `temp/` and deleted after analysis
- **Max File Size**: 50 MB
- **CORS Enabled**: Allows requests from any origin (configure for production)
- **Error Handling**: Invalid files return appropriate HTTP error codes

## Next Steps

- Add more sophisticated stat extraction (APM, pressure metrics, etc.)
- Implement player-specific analysis (per-character stats)
- Add machine learning-based feedback
- Create a database for storing analysis history
- Add authentication for user tracking
