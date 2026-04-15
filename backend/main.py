"""
StockSense backend API using FastAPI.
Handles .slp replay file uploads and provides analysis.
"""

import os
from pathlib import Path
from uuid import uuid4
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware

try:
    from .services.parser import load_replay, extract_metadata, ReplayParseError
    from .services.stats import extract_stats
    from .services.feedback import generate_feedback, format_feedback_response
except ImportError:
    from services.parser import load_replay, extract_metadata, ReplayParseError
    from services.stats import extract_stats
    from services.feedback import generate_feedback, format_feedback_response


# Configuration
BASE_DIR = Path(__file__).resolve().parent
TEMP_DIR = BASE_DIR / "temp"
TEMP_DIR.mkdir(exist_ok=True)
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB

# Initialize FastAPI app
app = FastAPI(
    title="StockSense API",
    description="API for analyzing Super Smash Bros. Melee replays using Slippi data",
    version="0.1.0"
)

# Add CORS middleware to allow frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to your frontend domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health_check():
    """Health check endpoint."""
    return {"status": "healthy", "service": "stocksense-api"}


@app.post("/analyze")
async def analyze_replay(file: UploadFile = File(...)):
    """
    Upload and analyze a Slippi .slp replay file.
    
    Returns:
        JSON with extracted stats and feedback
    """
    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Missing filename in uploaded form data."
        )

    try:
        return await _analyze_uploaded_replay(file)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error processing replay: {str(e)}"
        )


@app.post("/analyze-batch")
async def analyze_replay_batch(files: list[UploadFile] = File(...)):
    """Upload and analyze multiple Slippi replays for trend tracking."""
    if not files:
        raise HTTPException(
            status_code=400,
            detail="Please upload at least one .slp replay file."
        )

    replay_results = []
    failed_files = []
    available_tags = set()

    for file in files:
        if not file.filename:
            failed_files.append({
                "filename": "unknown-file",
                "error": "Missing filename in uploaded form data.",
            })
            continue

        try:
            analysis = await _analyze_uploaded_replay(file)
            replay_results.append({
                "filename": Path(file.filename).name,
                **analysis,
            })

            for player in analysis.get("metadata", {}).get("players", []):
                tag = (player.get("tag") or "").strip()
                if tag and not player.get("is_cpu", False):
                    available_tags.add(tag)
        except HTTPException as exc:
            failed_files.append({
                "filename": Path(file.filename).name,
                "error": str(exc.detail),
            })
        except Exception as exc:
            failed_files.append({
                "filename": Path(file.filename).name,
                "error": f"Error processing replay: {str(exc)}",
            })

    if not replay_results and failed_files:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "None of the uploaded replay files could be processed.",
                "failed_files": failed_files,
            }
        )

    return {
        "replays": replay_results,
        "available_tags": sorted(available_tags),
        "failed_files": failed_files,
    }


async def _analyze_uploaded_replay(file: UploadFile):
    safe_filename = Path(file.filename).name

    if Path(safe_filename).suffix.lower() != ".slp":
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Please upload a .slp (Slippi replay) file."
        )

    temp_file_path = TEMP_DIR / f"{uuid4()}-{safe_filename}"

    try:
        with open(temp_file_path, "wb") as buffer:
            content = await file.read()
            if len(content) > MAX_FILE_SIZE:
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large. Maximum size is {MAX_FILE_SIZE / 1024 / 1024:.0f} MB"
                )
            if len(content) == 0:
                raise HTTPException(
                    status_code=400,
                    detail="Uploaded file is empty."
                )
            buffer.write(content)

        try:
            game = load_replay(str(temp_file_path))
        except ReplayParseError as e:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to parse replay file: {e}"
            ) from e
        
        metadata = extract_metadata(game)
        stats = extract_stats(game)
        feedback = generate_feedback(stats)

        response = format_feedback_response(stats, feedback)
        response["metadata"] = metadata

        return response

    finally:
        if temp_file_path.exists():
            try:
                os.remove(temp_file_path)
            except Exception as e:
                print(f"Warning: Could not delete temp file: {e}")


@app.get("/")
def root():
    """Root endpoint with API documentation."""
    return {
        "message": "StockSense API",
        "version": "0.1.0",
        "endpoints": {
            "health": "/health",
            "analyze": "POST /analyze (upload .slp file)",
            "docs": "/docs",
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)
