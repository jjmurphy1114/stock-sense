"""
StockSense backend API using FastAPI.
Handles .slp replay file uploads and provides analysis.
"""

import asyncio
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
ANALYSIS_JOBS: dict[str, dict] = {}

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


@app.post("/analyze-start")
async def analyze_replay_start(file: UploadFile = File(...)):
    """Start asynchronous analysis of a single replay and return a job id."""
    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Missing filename in uploaded form data."
        )

    safe_filename = Path(file.filename).name
    content = await file.read()
    temp_file_path = _persist_uploaded_content(safe_filename, content)

    job_id = str(uuid4())
    ANALYSIS_JOBS[job_id] = {
        "status": "queued",
        "phase": "queued",
        "progress": 0,
        "total_files": 1,
        "processed_files": 0,
        "result": None,
        "error": None,
    }

    asyncio.create_task(
        _run_analysis_job(
            job_id=job_id,
            uploaded_files=[(safe_filename, temp_file_path)],
            is_batch=False,
        )
    )

    return {"job_id": job_id}


@app.post("/analyze-batch-start")
async def analyze_replay_batch_start(files: list[UploadFile] = File(...)):
    """Start asynchronous analysis of multiple replays and return a job id."""
    if not files:
        raise HTTPException(
            status_code=400,
            detail="Please upload at least one .slp replay file."
        )

    uploaded_files: list[tuple[str, Path]] = []

    for file in files:
        if not file.filename:
            continue

        safe_filename = Path(file.filename).name
        content = await file.read()
        temp_file_path = _persist_uploaded_content(safe_filename, content)
        uploaded_files.append((safe_filename, temp_file_path))

    if not uploaded_files:
        raise HTTPException(
            status_code=400,
            detail="None of the uploaded files had valid filenames."
        )

    job_id = str(uuid4())
    ANALYSIS_JOBS[job_id] = {
        "status": "queued",
        "phase": "queued",
        "progress": 0,
        "total_files": len(uploaded_files),
        "processed_files": 0,
        "result": None,
        "error": None,
    }

    asyncio.create_task(
        _run_analysis_job(
            job_id=job_id,
            uploaded_files=uploaded_files,
            is_batch=True,
        )
    )

    return {"job_id": job_id}


@app.get("/analysis-jobs/{job_id}")
def get_analysis_job(job_id: str):
    """Return progress and, when complete, the result for an analysis job."""
    job = ANALYSIS_JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="Analysis job not found")

    return {
        "job_id": job_id,
        "status": job["status"],
        "phase": job["phase"],
        "progress": job["progress"],
        "processed_files": job["processed_files"],
        "total_files": job["total_files"],
        "result": job["result"] if job["status"] == "completed" else None,
        "error": job["error"],
    }


async def _analyze_uploaded_replay(file: UploadFile):
    safe_filename = Path(file.filename).name

    content = await file.read()
    temp_file_path = _persist_uploaded_content(safe_filename, content)

    try:
        return _analyze_saved_replay(safe_filename, temp_file_path)
    finally:
        _cleanup_temp_file(temp_file_path)


def _persist_uploaded_content(safe_filename: str, content: bytes) -> Path:
    if Path(safe_filename).suffix.lower() != ".slp":
        raise HTTPException(
            status_code=400,
            detail="Invalid file type. Please upload a .slp (Slippi replay) file."
        )

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

    temp_file_path = TEMP_DIR / f"{uuid4()}-{safe_filename}"
    with open(temp_file_path, "wb") as buffer:
        buffer.write(content)

    return temp_file_path


def _analyze_saved_replay(safe_filename: str, temp_file_path: Path):
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
    response["filename"] = safe_filename

    return response


def _cleanup_temp_file(temp_file_path: Path) -> None:
    if temp_file_path.exists():
        try:
            os.remove(temp_file_path)
        except Exception as e:
            print(f"Warning: Could not delete temp file: {e}")


async def _run_analysis_job(
    job_id: str,
    uploaded_files: list[tuple[str, Path]],
    is_batch: bool,
) -> None:
    job = ANALYSIS_JOBS[job_id]
    replay_results = []
    failed_files = []
    available_tags = set()
    total_files = max(1, len(uploaded_files))

    job["status"] = "processing"
    job["phase"] = "processing"
    job["progress"] = 5

    try:
        for index, (safe_filename, temp_file_path) in enumerate(uploaded_files):
            try:
                analysis = await asyncio.to_thread(
                    _analyze_saved_replay,
                    safe_filename,
                    temp_file_path,
                )
                replay_results.append(analysis)

                for player in analysis.get("metadata", {}).get("players", []):
                    tag = (player.get("tag") or "").strip()
                    if tag and not player.get("is_cpu", False):
                        available_tags.add(tag)
            except HTTPException as exc:
                failed_files.append(
                    {
                        "filename": safe_filename,
                        "error": str(exc.detail),
                    }
                )
            except Exception as exc:
                failed_files.append(
                    {
                        "filename": safe_filename,
                        "error": f"Error processing replay: {str(exc)}",
                    }
                )
            finally:
                _cleanup_temp_file(temp_file_path)

            processed = index + 1
            job["processed_files"] = processed
            job["progress"] = min(95, int((processed / total_files) * 95))

        if is_batch:
            if not replay_results and failed_files:
                job["status"] = "failed"
                job["phase"] = "failed"
                job["error"] = "None of the uploaded replay files could be processed."
                return

            job["result"] = {
                "replays": replay_results,
                "available_tags": sorted(available_tags),
                "failed_files": failed_files,
            }
        else:
            if not replay_results:
                message = failed_files[0]["error"] if failed_files else "Analysis failed"
                job["status"] = "failed"
                job["phase"] = "failed"
                job["error"] = message
                return

            single_result = replay_results[0].copy()
            single_result.pop("filename", None)
            job["result"] = single_result

        job["progress"] = 100
        job["status"] = "completed"
        job["phase"] = "completed"
    except Exception as exc:
        job["status"] = "failed"
        job["phase"] = "failed"
        job["error"] = f"Unexpected error during analysis: {str(exc)}"


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
