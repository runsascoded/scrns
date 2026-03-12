interface ScrnsPage {
    goto(url: string): Promise<void>;
    setViewportSize(size: {
        width: number;
        height: number;
    }): Promise<void>;
    waitForSelector(selector: string, opts?: {
        timeout?: number;
    }): Promise<void>;
    screenshot(opts?: {
        path?: string;
        timeout?: number;
    }): Promise<Buffer>;
    evaluate<R>(pageFunction: string | ((...args: any[]) => R), arg?: any): Promise<R>;
    keyboard: {
        down(key: string): Promise<void>;
        up(key: string): Promise<void>;
        type(text: string): Promise<void>;
    };
    mouse: {
        click(x: number, y: number, opts?: {
            button?: 'left' | 'right';
        }): Promise<void>;
        move(x: number, y: number): Promise<void>;
        down(opts?: {
            button?: 'left' | 'right';
        }): Promise<void>;
        up(opts?: {
            button?: 'left' | 'right';
        }): Promise<void>;
    };
    setDownloadPath(dir: string): Promise<void>;
}
interface ScrnsBrowser {
    newPage(): Promise<ScrnsPage>;
    close(): Promise<void>;
}
interface ScrnsEngine {
    name: string;
    launch(opts: {
        headless: boolean;
        args?: string[];
    }): Promise<ScrnsBrowser>;
}

type EngineName = 'puppeteer' | 'playwright';
declare function resolveEngine(preference?: EngineName): Promise<ScrnsEngine>;

type ScreenshotConfig = {
    /** Output path (relative to outputDir, or absolute). Defaults to `{name}.png` */
    path?: string;
    /** URL path/query (appended to baseUrl) */
    query?: string;
    /** Viewport width (default: 800) */
    width?: number;
    /** Viewport height (default: 560) */
    height?: number;
    /** CSS selector to wait for before capturing (default: none) */
    selector?: string;
    /** Timeout in ms for selector wait (default: 30000) */
    loadTimeout?: number;
    /** Sleep in ms before taking screenshot (default: 0) */
    preScreenshotSleep?: number;
    /** Scroll Y pixels before screenshot (default: 0) */
    scrollY?: number;
    /** CSS selector to scroll into view before screenshot */
    scrollTo?: string;
    /** Offset in pixels above the scrollTo element (positive = more space above) */
    scrollOffset?: number;
    /** If true, set download behavior instead of taking screenshot */
    download?: boolean;
    /** Sleep in ms while waiting for download (default: 1000) */
    downloadSleep?: number;
    /** Additional browser launch args for this screenshot */
    browserArgs?: string[];
    /** Override headless mode for this screenshot (default: true) */
    headless?: boolean;
    /** Timeout in ms for page.screenshot() calls (default: 30000) */
    screenshotTimeout?: number;
};
type ScreencastAction = {
    type: 'wait';
    duration: number;
} | {
    type: 'keydown';
    key: string;
} | {
    type: 'keyup';
    key: string;
} | {
    type: 'key';
    key: string;
    duration: number;
} | {
    type: 'type';
    text: string;
} | {
    type: 'click';
    x: number;
    y: number;
    button?: 'left' | 'right';
} | {
    type: 'drag';
    from: [number, number];
    to: [number, number];
    duration: number;
    button?: 'left' | 'right';
} | {
    type: 'animate';
    frames: number;
    eval: string;
    frameDelay?: number;
};
type ScreencastConfig = ScreenshotConfig & {
    /** Presence of `actions` distinguishes a screencast from a screenshot */
    actions: ScreencastAction[];
    /** Frames per second for GIF capture (default: 15) */
    fps?: number;
    /** GIF quality: 1-30, lower = better (default: 10) */
    gifQuality?: number;
    /** Whether the GIF should loop (default: true) */
    loop?: boolean;
    /** CRF quality for video output (default: 23, lower = better) */
    videoCrf?: number;
};
declare function isScreencast(config: ScreenshotConfig | ScreencastConfig): config is ScreencastConfig;
type Screens = Record<string, ScreenshotConfig | ScreencastConfig>;
type Config = {
    engine?: 'puppeteer' | 'playwright';
    host?: string | number;
    https?: boolean;
    output?: string;
    selector?: string;
    loadTimeout?: number;
    downloadSleep?: number;
    browserArgs?: string[];
    headless?: boolean;
    screenshotTimeout?: number;
    docker?: boolean;
    dockerImage?: string;
    dockerPlatform?: string;
    screenshots: Screens;
};
declare function parseConfig(config: Screens | Config): {
    screens: Screens;
    options: Partial<Config>;
};
declare function resolveBaseUrl(host?: string | number, https?: boolean): string;

type ScreenshotsOptions = {
    /** Base URL (scheme + host) */
    baseUrl: string;
    /** Output directory for screenshots */
    outputDir: string;
    /** Default selector to wait for */
    defaultSelector?: string;
    /** Default load timeout in ms */
    defaultLoadTimeout?: number;
    /** Default download sleep in ms */
    defaultDownloadSleep?: number;
    /** Filter: only process screenshots matching this regex */
    include?: RegExp;
    /** Callback for logging */
    log?: (message: string) => void;
    /** Browser engine (resolved automatically if not provided) */
    engine?: ScrnsEngine;
    /** Additional browser launch args (merged with defaults and per-screenshot args) */
    browserArgs?: string[];
    /** Default headless mode (default: true) */
    headless?: boolean;
    /** Default screenshot timeout in ms (default: 30000) */
    defaultScreenshotTimeout?: number;
};
declare function takeScreenshots(screens: Screens, options: ScreenshotsOptions): Promise<void>;
type PreviewResult = {
    url: string;
    query: string;
    width: number;
    height: number;
};
declare function previewScreenshot(config: ScreenshotConfig, options: {
    baseUrl: string;
    outputDir: string;
    defaultSelector?: string;
    defaultLoadTimeout?: number;
    log?: (message: string) => void;
    engine?: ScrnsEngine;
    browserArgs?: string[];
}): Promise<PreviewResult>;

export { type Config, type EngineName, type PreviewResult, type ScreencastAction, type ScreencastConfig, type Screens, type ScreenshotConfig, type ScreenshotsOptions, type ScrnsBrowser, type ScrnsEngine, type ScrnsPage, isScreencast, parseConfig, previewScreenshot, resolveBaseUrl, resolveEngine, takeScreenshots };
