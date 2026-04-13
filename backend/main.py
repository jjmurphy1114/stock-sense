"""
Melee Coaching Backend API using FastAPI.
Handles .slp replay file uploads and provides analysis.
"""

import os
from pathlib import Path
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
    title="Melee Coaching API",
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
    return {"status": "healthy", "service": "melee-coaching-api"}


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

    safe_filename = Path(file.filename).name

    # Validate file type (case-insensitive)
    if Path(safe_filename).suffix.lower() != ".slp":
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Please upload a .slp (Slippi replay) file."
        )
    
    # Save uploaded file temporarily
    temp_file_path = TEMP_DIR / safe_filename
    
    try:
        # Save file
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
        
        # Parse the replay file
        try:
            game = load_replay(str(temp_file_path))
        except ReplayParseError as e:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to parse replay file: {e}"
            ) from e
        
        # Extract data
        metadata = extract_metadata(game)
        stats = extract_stats(game)
        feedback = generate_feedback(stats)
        
        # Format response
        response = format_feedback_response(stats, feedback)
        response["metadata"] = metadata
        
        return response
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error processing replay: {str(e)}"
        )
    
    finally:
        # Clean up temp file
        if temp_file_path.exists():
            try:
                os.remove(temp_file_path)
            except Exception as e:
                print(f"Warning: Could not delete temp file: {e}")


@app.get("/")
def root():
    """Root endpoint with API documentation."""
    return {
        "message": "Melee Coaching API",
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
