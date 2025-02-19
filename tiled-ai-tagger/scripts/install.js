const fs = require('fs');
const path = require('path');
const os = require('os');

// Determine Tiled extensions directory based on OS
function getTiledExtensionsDir() {
    // Check if we're running in WSL
    const isWSL = os.release().toLowerCase().includes('microsoft');
    if (isWSL) {
        // Use the Windows AppData path
        return '/mnt/c/Users/riley/AppData/Local/Tiled/extensions';
    }

    switch (process.platform) {
        case 'win32':
            return path.join(os.homedir(), 'AppData/Local/Tiled/extensions');
        case 'darwin':
            return path.join(os.homedir(), 'Library/Preferences/Tiled/extensions');
        default: // Linux and others
            return path.join(os.homedir(), '.local/share/tiled/extensions');
    }
}

// Create plugin directory if it doesn't exist
const pluginName = 'tiled-ai-tagger';
const extensionsDir = getTiledExtensionsDir();
const pluginDir = path.join(extensionsDir, pluginName);

console.log('Installing to:', pluginDir);

// Create directories if they don't exist
if (!fs.existsSync(extensionsDir)) {
    fs.mkdirSync(extensionsDir, { recursive: true });
}

if (!fs.existsSync(pluginDir)) {
    fs.mkdirSync(pluginDir);
} else {
    // Clean existing installation
    fs.rmSync(pluginDir, { recursive: true, force: true });
    fs.mkdirSync(pluginDir);
}

// Copy files
const filesToCopy = [
    ['src/index.js', 'index.js'],
    ['package.json', 'package.json'],
    ['README.md', 'README.md']
];

for (const [src, dest] of filesToCopy) {
    const sourcePath = path.join(__dirname, '..', src);
    const destPath = path.join(pluginDir, dest);
    
    if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
        console.log(`Copied ${path.basename(src)} to ${destPath}`);
    } else {
        console.error(`Warning: ${sourcePath} does not exist`);
    }
}

console.log('Installation complete!'); 