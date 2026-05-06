"""
StockSense backend API using FastAPI.
Handles .slp replay file uploads and provides analysis.
"""

import asyncio
import json
import os
from pathlib import Path
from uuid import uuid4
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware

try:
    from .services.parser import (
        load_replay,
        extract_metadata,
        get_frame_count,
        ReplayParseError,
    )
    from .services.stats import extract_stats
    from .services.feedback import generate_feedback, format_feedback_response
except ImportError:
    from services.parser import (
        load_replay,
        extract_metadata,
        get_frame_count,
        ReplayParseError,
    )
    from services.stats import extract_stats
    from services.feedback import generate_feedback, format_feedback_response


# Configuration
BASE_DIR = Path(__file__).resolve().parent
TEMP_DIR = BASE_DIR / "temp"
TEMP_DIR.mkdir(exist_ok=True)
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
ANALYSIS_JOBS: dict[str, dict] = {}


def _parse_saved_replay_ids(saved_replay_ids_raw: str | None) -> set[str]:
    if not saved_replay_ids_raw:
        return set()

    try:
        parsed = json.loads(saved_replay_ids_raw)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=400,
            detail="Invalid saved replay id payload.",
        ) from exc

    if not isinstance(parsed, list):
        raise HTTPException(
            status_code=400,
            detail="Saved replay ids must be a JSON array.",
        )

    return {
        replay_id
        for replay_id in parsed
        if isinstance(replay_id, str) and replay_id.strip()
    }

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

    for index, file in enumerate(files):
        if not file.filename:
            failed_files.append({
                "index": index,
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
async def analyze_replay_start(
    file: UploadFile = File(...),
    saved_replay_ids: str | None = Form(default=None),
    skip_duplicates: bool = Form(default=False),
):
    """Start asynchronous analysis of a single replay and return a job id."""
    if not file.filename:
        raise HTTPException(
            status_code=400,
            detail="Missing filename in uploaded form data."
        )

    safe_filename = Path(file.filename).name
    content = await file.read()
    temp_file_path = _persist_uploaded_content(safe_filename, content)
    saved_replay_id_set = _parse_saved_replay_ids(saved_replay_ids)

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
            saved_replay_ids=saved_replay_id_set,
            skip_duplicates=skip_duplicates,
        )
    )

    return {"job_id": job_id}


@app.post("/analyze-batch-start")
async def analyze_replay_batch_start(
    files: list[UploadFile] = File(...),
    saved_replay_ids: str | None = Form(default=None),
    skip_duplicates: bool = Form(default=False),
):
    """Start asynchronous analysis of multiple replays and return a job id."""
    if not files:
        raise HTTPException(
            status_code=400,
            detail="Please upload at least one .slp replay file."
        )

    uploaded_files: list[tuple[str, Path]] = []
    saved_replay_id_set = _parse_saved_replay_ids(saved_replay_ids)

    for index, file in enumerate(files):
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
            saved_replay_ids=saved_replay_id_set,
            skip_duplicates=skip_duplicates,
        )
    )

    return {"job_id": job_id}


@app.post("/replay-ids")
async def get_replay_ids(files: list[UploadFile] = File(...)):
    """Compute replay document ids without running the full analysis pipeline."""
    if not files:
        raise HTTPException(
            status_code=400,
            detail="Please upload at least one .slp replay file."
        )

    replay_ids = []
    failed_files = []

    for index, file in enumerate(files):
        if not file.filename:
            failed_files.append({
                "filename": "unknown-file",
                "error": "Missing filename in uploaded form data.",
            })
            continue

        safe_filename = Path(file.filename).name

        try:
            content = await file.read()
            temp_file_path = _persist_uploaded_content(safe_filename, content)

            try:
                replay_identity = _load_replay_identity(temp_file_path)
                replay_ids.append(
                    {
                        "index": index,
                        "filename": safe_filename,
                        "replay_id": _build_replay_document_id(replay_identity),
                        "metadata": replay_identity.get("metadata"),
                    }
                )
            finally:
                _cleanup_temp_file(temp_file_path)
        except HTTPException as exc:
            failed_files.append(
                {
                    "index": index,
                    "filename": safe_filename,
                    "error": str(exc.detail),
                }
            )
        except Exception as exc:
            failed_files.append(
                {
                    "index": index,
                    "filename": safe_filename,
                    "error": f"Error fingerprinting replay: {str(exc)}",
                }
            )

    return {
        "replays": replay_ids,
        "failed_files": failed_files,
    }


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

    return _analyze_loaded_replay(game, safe_filename)

def _analyze_loaded_replay(
    game,
    safe_filename: str,
    *,
    metadata: dict | None = None,
    include_feedback: bool = True,
    include_hit_locations: bool = True,
    replay_id: str | None = None,
):
    resolved_metadata = metadata or extract_metadata(game)
    stats = extract_stats(game, include_hit_locations=include_hit_locations)
    feedback = generate_feedback(stats) if include_feedback else []

    response = format_feedback_response(stats, feedback)
    response["metadata"] = resolved_metadata
    response["filename"] = safe_filename
    if replay_id is None:
        replay_id = _build_replay_document_id(
            {
                "metadata": resolved_metadata,
                "total_frames": stats.get("total_frames", 0),
                "match_duration_seconds": stats.get("match_duration_seconds", 0),
            }
        )
    response["replay_id"] = replay_id

    return response


def _load_replay_identity(temp_file_path: Path) -> dict:
    try:
        game = load_replay(str(temp_file_path))
    except ReplayParseError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to parse replay file: {e}"
        ) from e

    return _build_replay_identity(game)


def _build_replay_identity(game) -> dict:
    metadata = extract_metadata(game)
    total_frames = get_frame_count(game)

    return {
        "metadata": metadata,
        "total_frames": total_frames,
        "match_duration_seconds": round(total_frames / 60, 2),
    }


def _build_replay_document_id(replay_identity: dict) -> str:
    metadata = replay_identity.get("metadata", {})
    players = metadata.get("players", [])

    fingerprint = {
        "startedAt": metadata.get("started_at", "") or "",
        "stage": metadata.get("stage", "") or "",
        "numPlayers": metadata.get("num_players", 0) or 0,
        "winnerName": metadata.get("winner_name", "") or "",
        "winnerPlayerIndex": metadata.get("winner_player_index", None),
        "totalFrames": replay_identity.get("total_frames", 0) or 0,
        "matchDurationSeconds": replay_identity.get("match_duration_seconds", 0) or 0,
        "players": [
            {
                "playerIndex": player.get("player_index"),
                "character": player.get("character", ""),
                "tag": player.get("tag", "") or "",
                "connectCode": player.get("connect_code", "") or "",
                "netplayName": player.get("netplay_name", "") or "",
                "nameTag": player.get("name_tag", "") or "",
                "stocksLeft": player.get("stocks_left", None),
                "didWin": player.get("did_win"),
            }
            for player in players
        ],
    }

    fingerprint_json = json.dumps(
        fingerprint,
        ensure_ascii=False,
        separators=(",", ":"),
    )

    return f"replay_{_hash_fingerprint(fingerprint_json)}"


def _hash_fingerprint(input_text: str) -> str:
    hash_value = 2166136261

    for char in input_text:
        hash_value ^= ord(char)
        hash_value = (hash_value * 16777619) & 0xFFFFFFFF

    return format(hash_value, "08x")


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
    saved_replay_ids: set[str],
    skip_duplicates: bool,
) -> None:
    job = ANALYSIS_JOBS[job_id]
    replay_results = []
    failed_files = []
    available_tags = set()
    duplicate_files = []
    total_files = max(1, len(uploaded_files))

    job["status"] = "processing"
    job["phase"] = "processing"
    job["progress"] = 5

    try:
        for index, (safe_filename, temp_file_path) in enumerate(uploaded_files):
            try:
                game = await asyncio.to_thread(load_replay, str(temp_file_path))
                replay_identity = await asyncio.to_thread(_build_replay_identity, game)
                replay_id = _build_replay_document_id(replay_identity)

                if skip_duplicates and replay_id in saved_replay_ids:
                    duplicate_files.append(
                        {
                            "filename": safe_filename,
                            "replay_id": replay_id,
                        }
                    )
                    continue

                analysis = await asyncio.to_thread(
                    _analyze_loaded_replay,
                    game,
                    safe_filename,
                    metadata=replay_identity["metadata"],
                    include_feedback=not is_batch,
                    include_hit_locations=not is_batch,
                    replay_id=replay_id,
                )
                replay_results.append(analysis)

                for player in analysis.get("metadata", {}).get("players", []):
                    tag = (player.get("tag") or "").strip()
                    if tag and not player.get("is_cpu", False):
                        available_tags.add(tag)
            except ReplayParseError as exc:
                failed_files.append(
                    {
                        "filename": safe_filename,
                        "error": f"Failed to parse replay file: {str(exc)}",
                    }
                )
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
            if not replay_results and failed_files and not duplicate_files:
                job["status"] = "failed"
                job["phase"] = "failed"
                job["error"] = "None of the uploaded replay files could be processed."
                return

            job["result"] = {
                "replays": replay_results,
                "available_tags": sorted(available_tags),
                "failed_files": failed_files,
                "duplicate_files": duplicate_files,
            }
        else:
            if duplicate_files:
                job["result"] = {"duplicate_file": duplicate_files[0]}
            elif not replay_results:
                message = failed_files[0]["error"] if failed_files else "Analysis failed"
                job["status"] = "failed"
                job["phase"] = "failed"
                job["error"] = message
                return
            else:
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
