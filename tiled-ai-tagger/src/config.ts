export interface Config {
    serverUrl: string;
}

class ConfigManager {
    private static instance: ConfigManager;
    private config: Config;
    private readonly CONFIG_KEY = 'tiled_ai_tagger_config';
    private readonly DEFAULT_CONFIG: Config = {
        serverUrl: 'http://localhost:8000'
    };

    private constructor() {
        this.config = this.loadConfig();
    }

    public static getInstance(): ConfigManager {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }

    private loadConfig(): Config {
        const savedConfig = localStorage.getItem(this.CONFIG_KEY);
        if (savedConfig) {
            try {
                return JSON.parse(savedConfig);
            } catch {
                return this.DEFAULT_CONFIG;
            }
        }
        return this.DEFAULT_CONFIG;
    }

    public getConfig(): Config {
        return { ...this.config };
    }

    public updateConfig(newConfig: Partial<Config>): void {
        this.config = { ...this.config, ...newConfig };
        localStorage.setItem(this.CONFIG_KEY, JSON.stringify(this.config));
    }

    public resetConfig(): void {
        this.config = { ...this.DEFAULT_CONFIG };
        localStorage.setItem(this.CONFIG_KEY, JSON.stringify(this.config));
    }
}

export const configManager = ConfigManager.getInstance(); 