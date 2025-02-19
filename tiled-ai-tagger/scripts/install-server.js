const fs = require('fs');
const path = require('path');
const os = require('os');

// Get the Tiled extensions directory
function getTiledExtensionsDir() {
    const isWSL = os.release().toLowerCase().includes('microsoft');
    if (isWSL) {
        return '/mnt/c/Users/riley/AppData/Local/Tiled/extensions';
    }

    switch (process.platform) {
        case 'win32':
            return path.join(os.homedir(), 'AppData/Local/Tiled/extensions');
        case 'darwin':
            return path.join(os.homedir(), 'Library/Preferences/Tiled/extensions');
        default:
            return path.join(os.homedir(), '.local/share/tiled/extensions');
    }
}

// Setup paths
const pluginName = 'tiled-ai-tagger';
const extensionsDir = getTiledExtensionsDir();
const serverDir = path.join(extensionsDir, pluginName, 'server');

console.log('Installing server to:', serverDir);

// Create server directory
if (!fs.existsSync(serverDir)) {
    fs.mkdirSync(serverDir, { recursive: true });
} else {
    // Clean existing installation
    fs.rmSync(serverDir, { recursive: true, force: true });
    fs.mkdirSync(serverDir);
}

// Copy server files
const sourceServerDir = path.join(__dirname, '..', 'server');
const filesToCopy = [
    'main.py',
    'config.py',
    'rate_limiter.py',
    'cache_manager.py',
    'requirements.txt',
    'ml/__init__.py',
    'ml/model_manager.py',
    'ml/tag_manager.py',
    'ml/tile_tagger.py'
];

for (const file of filesToCopy) {
    const sourcePath = path.join(sourceServerDir, file);
    const destPath = path.join(serverDir, file);
    
    // Create subdirectories if needed
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) {
        fs.mkdirSync(destDir, { recursive: true });
    }
    
    if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
        console.log(`Copied ${file} to ${destPath}`);
    } else {
        console.error(`Warning: ${sourcePath} does not exist`);
    }
}

// Set executable permissions on the server file
const serverExe = path.join(serverDir, 'main');
if (fs.existsSync(serverExe)) {
    try {
        fs.chmodSync(serverExe, '755');
        console.log('Set executable permissions on server file');
    } catch (error) {
        console.error('Warning: Failed to set executable permissions:', error);
    }
}

console.log('Server installation complete!'); 