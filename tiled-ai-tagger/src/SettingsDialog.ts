/// <reference types="@mapeditor/tiled-api" />

import { configManager } from './config';
import { ApiClient } from './api/ApiClient';

export class SettingsDialog {
    private api: ApiClient;
    private readonly DEFAULT_PORT = 8000;

    constructor(api: ApiClient) {
        this.api = api;
    }

    public show(): void {
        const settings = configManager.getConfig();
        const port = this.getPortFromUrl(settings.serverUrl);
        
        const dialog = new Dialog("AI Tagger Settings");
        dialog.addHeading("Server Settings");
        dialog.addNewRow();
        
        const portInput = dialog.addNumberInput("Server Port:");
        portInput.value = port;
        
        if (dialog.exec()) {
            const newPort = portInput.value;
            if (newPort >= 1 && newPort <= 65535) {
                const newServerUrl = `http://localhost:${newPort}`;
                
                // Update settings
                configManager.updateConfig({ serverUrl: newServerUrl });
                
                // Update API client
                this.api.updateServerUrl(newServerUrl);
                
                tiled.alert("Settings updated successfully!");
            } else {
                tiled.alert("Invalid port number. Please enter a number between 1 and 65535.");
            }
        }
    }

    private getPortFromUrl(url: string): number {
        try {
            const port = new URL(url).port;
            return port ? parseInt(port) : this.DEFAULT_PORT;
        } catch {
            return this.DEFAULT_PORT;
        }
    }

    public reset(): void {
        configManager.resetConfig();
        const settings = configManager.getConfig();
        this.api.updateServerUrl(settings.serverUrl);
        tiled.alert("Settings reset to default values!");
    }
} 