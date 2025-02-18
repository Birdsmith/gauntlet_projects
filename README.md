# Tiled AI Enhancement Project

This project enhances the Tiled map editor with AI-powered features and usability improvements.

## Setup Instructions

### Prerequisites
- Python 3.8 or higher
- Node.js 14 or higher
- Qt 5.15 or higher
- Git

### Python Environment Setup
1. Create a virtual environment:
   ```bash
   python -m venv venv
   ```
2. Activate the virtual environment:
   - Windows: `venv\Scripts\activate`
   - Unix/MacOS: `source venv/bin/activate`
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

### Running Tests
```bash
pytest tests/
```

## Project Structure
- `src/` - Source code
- `tests/` - Test files
- `resources/` - Resource files
- `docs/` - Documentation

## Features
- AI-Powered Tile Tagging
- Natural Language Map Generation
- Contiguous Option for Bucket Fill and Magic Wand
- User-Defined Zoom Levels 