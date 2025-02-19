const fs = require('fs');
const path = require('path');

// Setup paths
const rootDir = path.join(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const pluginDir = path.join(distDir, 'tiled-ai-tagger');

// Create dist directory
if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
}

// Create plugin directory
if (!fs.existsSync(pluginDir)) {
    fs.mkdirSync(pluginDir);
} else {
    // Clean existing files
    fs.rmSync(pluginDir, { recursive: true, force: true });
    fs.mkdirSync(pluginDir);
}

// Copy compiled plugin files
const pluginFiles = [
    ['dist/index.js', 'index.js'],
    ['package.json', 'package.json'],
    ['README.md', 'README.md']
];

for (const [src, dest] of pluginFiles) {
    const sourcePath = path.join(rootDir, src);
    const destPath = path.join(pluginDir, dest);
    
    if (fs.existsSync(sourcePath)) {
        fs.copyFileSync(sourcePath, destPath);
        console.log(`Copied ${path.basename(src)} to ${destPath}`);
    } else {
        console.error(`Warning: ${sourcePath} does not exist`);
    }
}

// Create server directory and copy executable
const serverDir = path.join(pluginDir, 'server');
fs.mkdirSync(serverDir);

const serverExe = process.platform === 'win32' ? 'main.exe' : 'main';
const serverSrc = path.join(distDir, 'server', serverExe);
const serverDest = path.join(serverDir, serverExe);

if (fs.existsSync(serverSrc)) {
    fs.copyFileSync(serverSrc, serverDest);
    console.log(`Copied server executable to ${serverDest}`);
} else {
    console.error(`Warning: Server executable not found at ${serverSrc}`);
}

// Create a ZIP file of the plugin
const archiver = require('archiver');
const output = fs.createWriteStream(path.join(distDir, 'tiled-ai-tagger.zip'));
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
    console.log(`Created plugin package: ${archive.pointer()} total bytes`);
});

archive.on('error', (err) => {
    throw err;
});

archive.pipe(output);
archive.directory(pluginDir, 'tiled-ai-tagger');
archive.finalize();

console.log('Packaging complete!'); 