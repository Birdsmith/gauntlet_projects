#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
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
function createPluginDir(extensionsDir, pluginName) {
    const pluginDir = path.join(extensionsDir, pluginName);
    if (!fs.existsSync(pluginDir)) {
        fs.mkdirSync(pluginDir, { recursive: true });
    } else {
        // Clean existing installation
        fs.rmSync(pluginDir, { recursive: true, force: true });
        fs.mkdirSync(pluginDir);
    }
    return pluginDir;
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

// Copy plugin files from source to target
function copyPluginFiles(baseDir, targetDir, files) {
    for (const [src, dest] of files) {
        const sourcePath = path.join(baseDir, '..', src);
        const destPath = path.join(targetDir, dest);
        
        if (fs.existsSync(sourcePath)) {
            fs.copyFileSync(sourcePath, destPath);
            console.log(`Copied ${dest} to ${destPath}`);
        } else {
            console.warn(`Warning: ${sourcePath} does not exist`);
        }
    }
}

// Create settings template file
function createSettingsTemplate(pluginDir) {
    const settingsPath = path.join(pluginDir, 'settings.json');
    const template = {
        openaiApiKey: "",
        defaultMapWidth: 20,
        defaultMapHeight: 15
    };
    
    fs.writeFileSync(settingsPath, JSON.stringify(template, null, 2));
    console.log(`Created settings template at: ${settingsPath}`);
}

// Install a single plugin
function installPlugin(extensionsDir, pluginName, sourceFiles) {
    console.log(`\nInstalling ${pluginName}...`);
    
    const pluginDir = createPluginDir(extensionsDir, pluginName);
    console.log(`Plugin directory: ${pluginDir}`);
    
    copyPluginFiles(__dirname, pluginDir, sourceFiles);
    createSettingsTemplate(pluginDir);
    
    console.log(`${pluginName} installation complete!`);
}

// Main installation process
function install() {
    console.log('Starting Tiled AI Extensions installation...');
    
    const extensionsDir = getTiledExtensionsDir();
    console.log(`Tiled extensions directory: ${extensionsDir}`);
    
    // Create extensions directory if it doesn't exist
    if (!fs.existsSync(extensionsDir)) {
        fs.mkdirSync(extensionsDir, { recursive: true });
    }

    // Install AI Tagger
    const taggerFiles = [
        ['tiled-ai-tagger/index.js', 'index.js'],
        ['extension.json', 'extension.json']  // Use root extension.json for tagger
    ];
    installPlugin(extensionsDir, 'tiled-ai-tagger', taggerFiles);

    // Install AI Map Generator
    const mapgenFiles = [
        ['tiled-ai-mapgen/index.js', 'index.js'],
        ['tiled-ai-mapgen/extension.json', 'extension.json']
    ];
    installPlugin(extensionsDir, 'tiled-ai-mapgen', mapgenFiles);
    
    console.log('\nInstallation complete!');
    console.log('\nNext steps:');
    console.log('1. Open Tiled');
    console.log('2. Go to Edit > Preferences > Plugins');
    console.log('3. Enable both "Tiled AI Tagger" and "Tiled AI Map Generator" plugins');
    console.log('4. Configure your OpenAI API key in each plugin\'s settings');
}

// Run the installation
install(); 