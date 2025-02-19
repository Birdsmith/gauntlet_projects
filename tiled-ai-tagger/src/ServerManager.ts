/// <reference types="@mapeditor/tiled-api" />

import { configManager } from './config';

export class ServerManager {
    private static instance: ServerManager;
    private serverProcess: any = null;
    private isStarting: boolean = false;

    private constructor() {}

    public static getInstance(): ServerManager {
        if (!ServerManager.instance) {
            ServerManager.instance = new ServerManager();
        }
        return ServerManager.instance;
    }

    public async startServer(): Promise<void> {
        if (this.serverProcess || this.isStarting) {
            return;
        }

        this.isStarting = true;
        try {
            // Get Python executable path
            const pythonPath = await this.findPythonPath();
            if (!pythonPath) {
                throw new Error("Python not found. Please install Python 3.8 or higher.");
            }

            // Start server process
            this.serverProcess = new Process();
            this.serverProcess.workingDirectory = tiled.projectFilePath ? 
                tiled.projectFilePath.replace(/[^/\\]*$/, '') : 
                tiled.extensionsPath + "/tiled-ai-tagger/server";

            // Start the server
            const args = ["-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"];
            const success = this.serverProcess.start(pythonPath, args);

            if (!success) {
                throw new Error("Failed to start server process");
            }

            // Wait for server to be ready
            await this.waitForServer();
            tiled.log("AI Tagger server started successfully");
        } catch (error) {
            tiled.log(`Failed to start AI Tagger server: ${error}`);
            this.stopServer();
        } finally {
            this.isStarting = false;
        }
    }

    public stopServer(): void {
        if (this.serverProcess) {
            this.serverProcess.kill();
            this.serverProcess = null;
            tiled.log("AI Tagger server stopped");
        }
    }

    private async findPythonPath(): Promise<string | null> {
        // Try common Python paths
        const pythonPaths = [
            "python3",
            "python",
            "/usr/bin/python3",
            "/usr/local/bin/python3",
            "C:\\Python39\\python.exe",
            "C:\\Python38\\python.exe"
        ];

        for (const path of pythonPaths) {
            const process = new Process();
            if (process.start(path, ["--version"])) {
                const output = process.readLine();
                if (output && output.startsWith("Python 3.")) {
                    return path;
                }
            }
        }

        return null;
    }

    private async waitForServer(): Promise<void> {
        const maxAttempts = 10;
        const delayMs = 500;

        for (let i = 0; i < maxAttempts; i++) {
            try {
                const response = await fetch("http://127.0.0.1:8000/");
                if (response.ok) {
                    return;
                }
            } catch {
                // Server not ready yet
            }
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }

        throw new Error("Server failed to start within timeout");
    }

    public isRunning(): boolean {
        return this.serverProcess !== null && !this.serverProcess.atEnd();
    }
} 