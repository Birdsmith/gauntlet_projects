from fastapi import FastAPI, HTTPException, UploadFile, File, BackgroundTasks, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Optional
import uvicorn
import logging
from PIL import Image
import io
import json
from .config import settings
from .ml import TileTagger
from .rate_limiter import RateLimiter

# Configure logging
logging.basicConfig(
    level=settings.LOG_LEVEL,
    format=settings.LOG_FORMAT
)
logger = logging.getLogger(__name__)

# Initialize FastAPI app
app = FastAPI(
    title=settings.API_TITLE,
    description="Backend server for the Tiled AI Tagger plugin",
    version=settings.API_VERSION
)

# Add CORS middleware for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=settings.CORS_ALLOW_METHODS,
    allow_headers=settings.CORS_ALLOW_HEADERS,
)

# Initialize components
tagger = TileTagger()
rate_limiter = RateLimiter()

# Store analysis progress
analysis_progress = {}

# Models for request/response data
class TagData(BaseModel):
    category: str
    subcategory: str
    confidence: float

class TileAnalysisResponse(BaseModel):
    tile_id: str
    tags: List[TagData]

class TagStatistics(BaseModel):
    tile_count: int
    avg_confidence: float

class ProgressResponse(BaseModel):
    task_id: str
    processed: int
    total: int
    status: str

# Rate limiting dependency
async def check_rate_limit(request: Request):
    if settings.RATE_LIMIT_ENABLED:
        await rate_limiter.check_rate_limit_dependency(request)

@app.get("/")
async def root():
    """Health check endpoint"""
    return {
        "status": "running",
        "service": "tiled-ai-tagger",
        "version": settings.API_VERSION
    }

@app.post("/analyze/tile", response_model=TileAnalysisResponse, dependencies=[Depends(check_rate_limit)])
async def analyze_tile(tile_image: UploadFile = File(...), tile_id: str = None):
    """Analyze a single tile image and return tags"""
    try:
        # Read and validate image
        image_data = await tile_image.read()
        image = Image.open(io.BytesIO(image_data))
        
        # Analyze tile
        result = tagger.analyze_tile(image, tile_id)
        return result
        
    except Exception as e:
        logger.error(f"Error analyzing tile: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/analyze/tileset/start", dependencies=[Depends(check_rate_limit)])
async def start_tileset_analysis(
    background_tasks: BackgroundTasks,
    tiles: List[UploadFile] = File(...)
):
    """Start analyzing multiple tiles in a tileset"""
    try:
        # Generate task ID
        import uuid
        task_id = str(uuid.uuid4())
        
        # Read all images
        images = []
        tile_ids = []
        for i, tile in enumerate(tiles):
            image_data = await tile.read()
            image = Image.open(io.BytesIO(image_data))
            images.append(image)
            tile_ids.append(f"tile_{i}")
        
        # Initialize progress
        analysis_progress[task_id] = {
            "processed": 0,
            "total": len(images),
            "status": "processing",
            "results": []
        }
        
        # Start analysis in background
        background_tasks.add_task(
            process_tileset,
            task_id,
            images,
            tile_ids
        )
        
        return {"task_id": task_id}
        
    except Exception as e:
        logger.error(f"Error starting tileset analysis: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

async def process_tileset(task_id: str, images: List[Image.Image], tile_ids: List[str]):
    """Process tileset analysis in background"""
    try:
        def update_progress(processed: int, total: int):
            analysis_progress[task_id]["processed"] = processed
        
        # Analyze tileset with progress tracking
        for chunk_results in tagger.analyze_tileset(
            images,
            tile_ids,
            progress_callback=update_progress
        ):
            analysis_progress[task_id]["results"].extend(chunk_results)
        
        analysis_progress[task_id]["status"] = "completed"
        
    except Exception as e:
        logger.error(f"Error processing tileset: {str(e)}")
        analysis_progress[task_id]["status"] = "error"
        analysis_progress[task_id]["error"] = str(e)

@app.get("/analyze/tileset/progress/{task_id}", response_model=ProgressResponse, dependencies=[Depends(check_rate_limit)])
async def get_tileset_progress(task_id: str):
    """Get progress of tileset analysis"""
    if task_id not in analysis_progress:
        raise HTTPException(status_code=404, detail="Task not found")
    
    progress = analysis_progress[task_id]
    return {
        "task_id": task_id,
        "processed": progress["processed"],
        "total": progress["total"],
        "status": progress["status"]
    }

@app.get("/analyze/tileset/results/{task_id}", dependencies=[Depends(check_rate_limit)])
async def get_tileset_results(task_id: str):
    """Get results of tileset analysis"""
    if task_id not in analysis_progress:
        raise HTTPException(status_code=404, detail="Task not found")
    
    progress = analysis_progress[task_id]
    
    if progress["status"] == "error":
        raise HTTPException(
            status_code=500,
            detail=progress.get("error", "Unknown error occurred")
        )
    
    if progress["status"] != "completed":
        raise HTTPException(
            status_code=400,
            detail="Analysis not completed yet"
        )
    
    return progress["results"]

@app.post("/analyze/tileset/cancel/{task_id}", dependencies=[Depends(check_rate_limit)])
async def cancel_tileset_analysis(task_id: str):
    """Cancel ongoing tileset analysis"""
    if task_id not in analysis_progress:
        raise HTTPException(status_code=404, detail="Task not found")
    
    progress = analysis_progress[task_id]
    if progress["status"] == "processing":
        tagger.cancel_analysis()
        progress["status"] = "cancelled"
    
    return {"status": "cancelled"}

@app.get("/statistics/{tileset_id}", response_model=Dict[str, TagStatistics], dependencies=[Depends(check_rate_limit)])
async def get_statistics(tileset_id: str, tile_tags: List[Dict]):
    """Get tag statistics for a tileset"""
    try:
        stats = tagger.get_tag_statistics(tile_tags)
        return stats
        
    except Exception as e:
        logger.error(f"Error getting statistics: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/similar/{tile_id}", response_model=List[int], dependencies=[Depends(check_rate_limit)])
async def find_similar_tiles(
    tile_id: str,
    tile_image: UploadFile = File(...),
    target_images: List[UploadFile] = File(...),
    min_confidence: float = 0.7
):
    """Find tiles similar to the given tile"""
    try:
        # Read source image
        source_data = await tile_image.read()
        source_image = Image.open(io.BytesIO(source_data))
        
        # Read target images
        target_images_pil = []
        for target in target_images:
            target_data = await target.read()
            target_images_pil.append(Image.open(io.BytesIO(target_data)))
        
        # Find similar tiles
        similar_indices = tagger.find_similar_tiles(
            source_image,
            target_images_pil,
            min_confidence
        )
        return similar_indices
        
    except Exception as e:
        logger.error(f"Error finding similar tiles: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/categories", dependencies=[Depends(check_rate_limit)])
async def get_categories():
    """Get available tag categories"""
    try:
        return tagger.get_available_categories()
    except Exception as e:
        logger.error(f"Error getting categories: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.RELOAD
    ) 