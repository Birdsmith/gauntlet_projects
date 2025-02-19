"""Tests for the Model Manager."""

import pytest
import torch
import tempfile
from pathlib import Path
from src.tile_tagger.model_manager import ModelManager

@pytest.fixture
def model_manager():
    """Create a ModelManager instance with a temporary directory."""
    with tempfile.TemporaryDirectory() as tmpdir:
        manager = ModelManager()
        # Override the model directory for testing
        manager.model_dir = Path(tmpdir)
        manager.model_path = manager.model_dir / "tile_tagger_model.pth"
        yield manager

def test_model_download(model_manager):
    """Test downloading and configuring the model."""
    num_categories = 6
    model = model_manager.download_model(num_categories)
    
    # Check model structure
    assert isinstance(model, torch.nn.Module)
    assert isinstance(model.fc, torch.nn.Sequential)
    assert model.fc[-1].out_features == num_categories
    
    # Check that model was saved
    assert model_manager.model_path.exists()

def test_model_load(model_manager):
    """Test loading an existing model."""
    num_categories = 6
    
    # First download the model
    original_model = model_manager.download_model(num_categories)
    original_state = original_model.state_dict()
    
    # Then load it
    loaded_model = model_manager.load_model(num_categories)
    loaded_state = loaded_model.state_dict()
    
    # Check that the loaded model matches the original
    assert len(loaded_state) == len(original_state)
    for key in original_state:
        assert torch.equal(original_state[key], loaded_state[key])

def test_model_update(model_manager):
    """Test updating model weights."""
    num_categories = 6
    model = model_manager.download_model(num_categories)
    
    # Modify some weights
    with torch.no_grad():
        model.fc[-1].weight *= 2
    
    # Save the modified model
    model_manager.update_model(model)
    
    # Load it back and verify changes persisted
    loaded_model = model_manager.load_model(num_categories)
    assert torch.equal(model.fc[-1].weight, loaded_model.fc[-1].weight)

def test_model_architecture(model_manager):
    """Test that the model architecture is correct."""
    num_categories = 6
    model = model_manager.download_model(num_categories)
    
    # Check the feature extractor
    assert isinstance(model, torch.nn.Module)
    assert hasattr(model, 'conv1')
    assert hasattr(model, 'layer1')
    assert hasattr(model, 'layer2')
    assert hasattr(model, 'layer3')
    assert hasattr(model, 'layer4')
    
    # Check the classifier
    assert isinstance(model.fc, torch.nn.Sequential)
    assert len(model.fc) == 4  # Linear -> ReLU -> Dropout -> Linear
    assert isinstance(model.fc[0], torch.nn.Linear)
    assert isinstance(model.fc[1], torch.nn.ReLU)
    assert isinstance(model.fc[2], torch.nn.Dropout)
    assert isinstance(model.fc[3], torch.nn.Linear)
    assert model.fc[-1].out_features == num_categories 