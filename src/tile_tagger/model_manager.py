"""
Model management for the Tile Tagger plugin.
Handles downloading, saving, and loading of the ML model.
"""

import os
import torch
import torch.nn as nn
from torchvision import models
from pathlib import Path

class ModelManager:
    """Manages the ML model lifecycle."""
    
    def __init__(self):
        """Initialize model manager."""
        self.model_dir = Path.home() / ".tiled" / "models"
        self.model_path = self.model_dir / "tile_tagger_model.pth"
        self.model_dir.mkdir(parents=True, exist_ok=True)
        self.num_base_categories = 6  # Fixed number of base categories
    
    def download_model(self, num_categories=None):
        """Download and configure the pre-trained model."""
        if num_categories is None:
            num_categories = self.num_base_categories
            
        print("Downloading pre-trained ResNet18 model...")
        model = models.resnet18(pretrained=True)
        
        # Modify for our multi-label classification
        num_features = model.fc.in_features
        model.fc = nn.Sequential(
            nn.Linear(num_features, 256),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(256, num_categories)
        )
        
        # Save the model
        torch.save(model.state_dict(), self.model_path)
        print(f"Model saved to {self.model_path}")
        return model
    
    def load_model(self, num_categories=None):
        """Load the model, downloading if necessary."""
        if num_categories is None:
            num_categories = self.num_base_categories
            
        print("Loading existing model...")
        model = models.resnet18(pretrained=False)
        
        # Configure architecture
        num_features = model.fc.in_features
        model.fc = nn.Sequential(
            nn.Linear(num_features, 256),
            nn.ReLU(),
            nn.Dropout(0.2),
            nn.Linear(256, num_categories)
        )
        
        if not self.model_path.exists():
            return self.download_model(num_categories)
        
        try:
            # Load weights
            model.load_state_dict(torch.load(self.model_path))
            model.eval()  # Set to evaluation mode
            print("Model loaded successfully")
        except Exception as e:
            print(f"Error loading model: {e}")
            print("Creating new model...")
            model = self.download_model(num_categories)
            
        return model
    
    def update_model(self, model):
        """Save updated model weights."""
        torch.save(model.state_dict(), self.model_path)
        print(f"Model updated and saved to {self.model_path}") 