# Tiled AI Tagger Plugin

An AI-powered plugin for the Tiled Map Editor that automatically tags tiles based on their visual content.

## Features

- Automatic tile analysis using machine learning
- Smart tag management with confidence scores
- Similar tile finding
- Tag statistics and visualization
- Efficient caching and batch processing

## Installation

1. Install Node.js and npm if you haven't already
2. Clone this repository
3. Install dependencies:
   ```bash
   npm install
   ```
4. Build the plugin:
   ```bash
   npm run build
   ```
5. Copy the built plugin to your Tiled extensions directory:
   - Windows: `%APPDATA%\Tiled\extensions\`
   - Linux: `~/.local/share/tiled/extensions/`
   - macOS: `~/Library/Preferences/Tiled/extensions/`

## Usage

1. Open Tiled Map Editor
2. Load a tileset
3. Use the new "Tileset" menu items:
   - "Analyze Current Tileset" - Run AI analysis on all tiles
   - "Show Tag Statistics" - View tag usage statistics
   - "Find Similar Tiles" - Find tiles with similar tags

## Development

- Build: `npm run build`
- Watch mode: `npm run watch`
- Run tests: `npm test`
- Lint: `npm run lint`

## Requirements

- Tiled Map Editor 1.10.1 or later
- Node.js 18 or later
- npm 9 or later

## License

MIT

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request 