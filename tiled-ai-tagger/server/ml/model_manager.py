import torch
import torch.nn as nn
from torchvision import models, transforms
from pathlib import Path
import logging
from typing import List, Callable, Optional
from ..config import settings

logger = logging.getLogger(__name__)

class ModelManager:
    """Manages the ML model lifecycle for tile analysis."""
    
    def __init__(self):
        """Initialize model manager with settings from config."""
        self.model = None
        self.transform = self._setup_transforms()
        self.initialize_model()
        self._cancel_requested = False
    
    def _setup_transforms(self):
        """Set up image transformations for model input."""
        return transforms.Compose([
            transforms.Resize((settings.IMAGE_SIZE, settings.IMAGE_SIZE)),
            transforms.ToTensor(),
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225]
            )
        ])
    
    def initialize_model(self):
        """Initialize or load the pre-trained model."""
        try:
            # Create model architecture
            self.model = models.resnet18(pretrained=True)
            
            # Modify for multi-label classification
            num_features = self.model.fc.in_features
            self.model.fc = nn.Sequential(
                nn.Linear(num_features, 256),
                nn.ReLU(),
                nn.Dropout(0.2),
                nn.Linear(256, 9)  # 3 categories x 3 subcategories
            )
            
            # Load weights if they exist
            if settings.MODEL_PATH.exists():
                logger.info(f"Loading model from {settings.MODEL_PATH}")
                self.model.load_state_dict(torch.load(settings.MODEL_PATH))
            else:
                logger.info("No existing model found. Using pre-trained weights.")
                self.save_model()  # Save the initial model
            
            # Move to GPU if available
            if torch.cuda.is_available():
                self.model = self.model.cuda()
            
            self.model.eval()  # Set to evaluation mode
            
        except Exception as e:
            logger.error(f"Error initializing model: {e}")
            raise
    
    def save_model(self):
        """Save the current model state."""
        try:
            torch.save(self.model.state_dict(), settings.MODEL_PATH)
            logger.info(f"Model saved to {settings.MODEL_PATH}")
        except Exception as e:
            logger.error(f"Error saving model: {e}")
            raise
    
    def analyze_image(self, image):
        """Analyze a single image and return predictions."""
        try:
            # Ensure model is initialized
            if self.model is None:
                self.initialize_model()
            
            # Prepare image
            img_tensor = self.transform(image).unsqueeze(0)
            if torch.cuda.is_available():
                img_tensor = img_tensor.cuda()
            
            # Get predictions
            with torch.no_grad():
                predictions = torch.sigmoid(self.model(img_tensor))
                if torch.cuda.is_available():
                    predictions = predictions.cpu()
            
            # Clean up GPU memory
            if torch.cuda.is_available():
                del img_tensor
                torch.cuda.empty_cache()
            
            return predictions[0].numpy()
            
        except Exception as e:
            logger.error(f"Error analyzing image: {e}")
            raise
    
    def analyze_batch(
        self,
        images: List,
        batch_size: int = 16,
        progress_callback: Optional[Callable[[int, int], None]] = None,
        chunk_size: Optional[int] = None
    ):
        """Analyze a batch of images efficiently with progress tracking and chunking.
        
        Args:
            images: List of images to analyze
            batch_size: Number of images to process at once
            progress_callback: Function to call with progress updates (processed, total)
            chunk_size: Maximum number of images to process before yielding results
        """
        try:
            # Ensure model is initialized
            if self.model is None:
                self.initialize_model()
            
            self._cancel_requested = False
            total_images = len(images)
            processed = 0
            all_predictions = []
            
            # Process images in chunks if specified
            if chunk_size:
                for chunk_start in range(0, total_images, chunk_size):
                    chunk_end = min(chunk_start + chunk_size, total_images)
                    chunk = images[chunk_start:chunk_end]
                    
                    # Process the chunk in batches
                    chunk_predictions = self._process_chunk(
                        chunk,
                        batch_size,
                        lambda p: progress_callback(chunk_start + p, total_images) if progress_callback else None
                    )
                    
                    if self._cancel_requested:
                        logger.info("Analysis cancelled")
                        break
                    
                    all_predictions.extend(chunk_predictions)
                    processed += len(chunk)
                    
                    # Clean up GPU memory after each chunk
                    if torch.cuda.is_available():
                        torch.cuda.empty_cache()
                    
                    # Yield results for this chunk
                    yield all_predictions[-len(chunk):]
            else:
                # Process all images in batches
                predictions = self._process_chunk(
                    images,
                    batch_size,
                    progress_callback
                )
                if not self._cancel_requested:
                    yield predictions
            
        except Exception as e:
            logger.error(f"Error analyzing batch: {e}")
            raise
    
    def _process_chunk(
        self,
        images: List,
        batch_size: int,
        progress_callback: Optional[Callable[[int, int], None]] = None
    ) -> List:
        """Process a chunk of images in batches."""
        chunk_predictions = []
        total = len(images)
        
        for i in range(0, total, batch_size):
            if self._cancel_requested:
                break
                
            batch = images[i:i + batch_size]
            
            # Prepare batch
            batch_tensors = [self.transform(img).unsqueeze(0) for img in batch]
            batch_tensor = torch.cat(batch_tensors, dim=0)
            
            if torch.cuda.is_available():
                batch_tensor = batch_tensor.cuda()
            
            # Get predictions
            with torch.no_grad():
                predictions = torch.sigmoid(self.model(batch_tensor))
                if torch.cuda.is_available():
                    predictions = predictions.cpu()
            
            chunk_predictions.extend(predictions.numpy())
            
            # Clean up GPU memory
            if torch.cuda.is_available():
                del batch_tensor, predictions
                torch.cuda.empty_cache()
            
            # Update progress
            if progress_callback:
                progress_callback(i + len(batch), total)
        
        return chunk_predictions
    
    def cancel_analysis(self):
        """Cancel any ongoing analysis."""
        self._cancel_requested = True
    
    def cleanup(self):
        """Clean up resources."""
        if torch.cuda.is_available():
            torch.cuda.empty_cache() 