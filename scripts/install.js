#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const os = require('os');

// Get Tiled plugins directory based on OS
function getTiledPluginsDir() {
    const platform = os.platform();
    const home = os.homedir();
    
    switch (platform) {
        case 'win32':
            return path.join(home, 'AppData', 'Local', 'Tiled', 'extensions');
        case 'darwin':
            return path.join(home, 'Library', 'Preferences', 'Tiled', 'extensions');
        default: // Linux and others
            return path.join(home, '.local', 'share', 'tiled', 'extensions');
    }
}

// Create plugin directory if it doesn't exist
function createPluginDir(pluginDir) {
    const fullPath = path.join(pluginDir, 'tiled-ai-tagger');
    if (!fs.existsSync(fullPath)) {
        fs.mkdirSync(fullPath, { recursive: true });
    }
    return fullPath;
}

// Build TypeScript files
function buildTypeScript() {
    console.log('Building TypeScript files...');
    try {
        execSync('npm install', { stdio: 'inherit' });
        execSync('npm run build', { stdio: 'inherit' });
    } catch (error) {
        console.error('Failed to build TypeScript files:', error);
        process.exit(1);
    }
}

// Copy plugin files
function copyPluginFiles(targetDir) {
    const files = [
        { src: 'tiled-ai-tagger/index.js', dest: 'index.js' },
        { src: 'extension.json', dest: 'extension.json' },
        { src: 'package.json', dest: 'package.json' },
        { src: 'README.md', dest: 'README.md' }
    ];

    console.log(`Copying plugin files to ${targetDir}...`);

    files.forEach(file => {
        try {
            const sourcePath = path.resolve(__dirname, '..', file.src);
            const targetPath = path.join(targetDir, file.dest);

            if (fs.existsSync(sourcePath)) {
                // Read file as binary
                const content = fs.readFileSync(sourcePath);
                // Write file as binary
                fs.writeFileSync(targetPath, content);
                console.log(`Copied ${file.src} to ${targetPath}`);
            } else {
                console.warn(`Warning: Source file not found: ${sourcePath}`);
            }
        } catch (error) {
            console.error(`Error copying ${file.src}:`, error);
        }
    });
}

// Create settings template
function createSettingsTemplate(targetDir) {
    const settingsTemplate = {
        openaiApiKey: "YOUR_API_KEY_HERE",
        batchSize: 1,
        confidenceThreshold: 0.7,
        enableCaching: true,
        cacheExpiration: 3600,
        retryDelay: 1000,
        maxRetries: 3
    };

    const settingsPath = path.join(targetDir, 'settings.json');
    try {
        fs.writeFileSync(settingsPath, JSON.stringify(settingsTemplate, null, 2));
        console.log('Created settings template');
    } catch (error) {
        console.error('Failed to create settings template:', error);
    }
}

// Main installation process
function install() {
    console.log('Starting Tiled AI Tagger installation...');
    
    const pluginsDir = getTiledPluginsDir();
    console.log(`Tiled plugins directory: ${pluginsDir}`);
    
    const targetDir = createPluginDir(pluginsDir);
    console.log(`Plugin directory created: ${targetDir}`);
    
    copyPluginFiles(targetDir);
    createSettingsTemplate(targetDir);
    
    console.log('\nInstallation complete!');
    console.log('\nNext steps:');
    console.log('1. Open Tiled');
    console.log('2. Go to Edit > Preferences > Plugins');
    console.log('3. Enable "Tiled AI Tagger" plugin');
    console.log('4. Configure your OpenAI API key in the settings');
}

// Run installation
install(); 