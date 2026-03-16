// src/index.ts
import { isAbsolute, dirname, resolve } from "path";
import { mkdirSync, writeFileSync } from "fs";
import { spawn, execFileSync } from "child_process";
import * as gifencModule from "gifenc";
import { PNG } from "pngjs";

// src/engines/puppeteer.ts
async function createPuppeteerEngine() {
  const puppeteer = (await import("puppeteer")).default;
  return {
    name: "puppeteer",
    async launch(opts) {
      const browser = await puppeteer.launch({
        headless: opts.headless,
        args: opts.args
      });
      return wrapBrowser(browser);
    }
  };
}
function wrapBrowser(browser) {
  return {
    async newPage() {
      const page = await browser.newPage();
      return wrapPage(page);
    },
    async close() {
      await browser.close();
    }
  };
}
function wrapPage(page) {
  return {
    async goto(url) {
      await page.goto(url);
    },
    async setViewportSize(size) {
      await page.setViewport(size);
    },
    async waitForSelector(selector, opts) {
      await page.waitForSelector(selector, opts);
    },
    async screenshot(opts) {
      const result = await page.screenshot({
        path: opts?.path,
        encoding: "binary",
        timeout: opts?.timeout
      });
      return Buffer.from(result);
    },
    async evaluate(pageFunction, arg) {
      if (arg !== void 0) {
        return page.evaluate(pageFunction, arg);
      }
      return page.evaluate(pageFunction);
    },
    keyboard: {
      async down(key) {
        await page.keyboard.down(key);
      },
      async up(key) {
        await page.keyboard.up(key);
      },
      async type(text) {
        await page.keyboard.type(text);
      }
    },
    mouse: {
      async click(x, y, opts) {
        await page.mouse.click(x, y, opts);
      },
      async move(x, y) {
        await page.mouse.move(x, y);
      },
      async down(opts) {
        await page.mouse.down(opts);
      },
      async up(opts) {
        await page.mouse.up(opts);
      }
    },
    async setDownloadPath(dir) {
      const client = await page.createCDPSession();
      await client.send("Page.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: dir
      });
    }
  };
}

// src/engines/playwright.ts
async function createPlaywrightEngine() {
  const { chromium } = await import("playwright");
  return {
    name: "playwright",
    async launch(opts) {
      const browser = await chromium.launch({
        headless: opts.headless,
        args: opts.args
      });
      return wrapBrowser2(browser);
    }
  };
}
function wrapBrowser2(browser) {
  return {
    async newPage() {
      const page = await browser.newPage();
      return wrapPage2(page);
    },
    async close() {
      await browser.close();
    }
  };
}
function wrapPage2(page) {
  return {
    async goto(url) {
      await page.goto(url);
    },
    async setViewportSize(size) {
      await page.setViewportSize(size);
    },
    async waitForSelector(selector, opts) {
      await page.waitForSelector(selector, { ...opts, state: "attached" });
    },
    async screenshot(opts) {
      return page.screenshot({ path: opts?.path, timeout: opts?.timeout });
    },
    async evaluate(pageFunction, arg) {
      if (arg !== void 0) {
        return page.evaluate(pageFunction, arg);
      }
      return page.evaluate(pageFunction);
    },
    keyboard: {
      async down(key) {
        await page.keyboard.down(key);
      },
      async up(key) {
        await page.keyboard.up(key);
      },
      async type(text) {
        await page.keyboard.type(text);
      }
    },
    mouse: {
      async click(x, y, opts) {
        await page.mouse.click(x, y, opts);
      },
      async move(x, y) {
        await page.mouse.move(x, y);
      },
      async down(opts) {
        await page.mouse.down(opts);
      },
      async up(opts) {
        await page.mouse.up(opts);
      }
    },
    async setDownloadPath(dir) {
      const session = await page.context().newCDPSession(page);
      await session.send("Page.setDownloadBehavior", {
        behavior: "allow",
        downloadPath: dir
      });
    }
  };
}

// src/engines/resolve.ts
async function resolveEngine(preference) {
  if (preference === "playwright") return createPlaywrightEngine();
  if (preference === "puppeteer") return createPuppeteerEngine();
  try {
    return await createPlaywrightEngine();
  } catch {
  }
  try {
    return await createPuppeteerEngine();
  } catch {
  }
  throw new Error(
    "No browser engine found. Install either:\n  pnpm add playwright    # recommended\n  pnpm add puppeteer     # alternative"
  );
}

// src/index.ts
var gifenc = "default" in gifencModule && typeof gifencModule.default === "object" ? gifencModule.default : gifencModule;
var { GIFEncoder, quantize, applyPalette } = gifenc;
function isScreencast(config) {
  return "actions" in config && Array.isArray(config.actions);
}
var SCREENSHOT_KEYS = ["query", "width", "height", "selector", "loadTimeout", "path", "preScreenshotSleep", "scrollY", "scrollTo", "scrollOffset", "download", "downloadSleep", "actions", "fps", "gifQuality", "loop", "videoCrf", "browserArgs", "headless", "screenshotTimeout"];
function isScreens(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !SCREENSHOT_KEYS.some((k) => k in value);
}
function parseConfig(config) {
  if ("screenshots" in config && isScreens(config.screenshots)) {
    const { screenshots, ...options } = config;
    return { screens: screenshots, options };
  }
  return { screens: config, options: {} };
}
function resolveBaseUrl(host, https) {
  let h = host == null ? "127.0.0.1:3000" : String(host);
  if (h.match(/^\d+$/)) h = `127.0.0.1:${h}`;
  return `${https ? "https" : "http"}://${h}`;
}
var DEFAULT_WIDTH = 800;
var DEFAULT_HEIGHT = 560;
var DEFAULT_LOAD_TIMEOUT = 3e4;
var DEFAULT_DOWNLOAD_SLEEP = 1e3;
var DEFAULT_SCREENSHOT_TIMEOUT = 3e4;
var BASE_BROWSER_ARGS = [
  "--no-sandbox",
  "--disable-skia-runtime-opts",
  "--force-device-scale-factor=1"
];
function parseKeys(key) {
  return key.split("+");
}
async function executeActions(page, actions, log) {
  for (const action of actions) {
    switch (action.type) {
      case "wait":
        log(`  action: wait ${action.duration}ms`);
        await sleep(action.duration);
        break;
      case "keydown":
        log(`  action: keydown ${action.key}`);
        for (const k of parseKeys(action.key)) await page.keyboard.down(k);
        break;
      case "keyup":
        log(`  action: keyup ${action.key}`);
        for (const k of parseKeys(action.key).reverse()) await page.keyboard.up(k);
        break;
      case "key": {
        log(`  action: key ${action.key} ${action.duration}ms`);
        const keys = parseKeys(action.key);
        for (const k of keys) await page.keyboard.down(k);
        await sleep(action.duration);
        for (const k of keys.reverse()) await page.keyboard.up(k);
        break;
      }
      case "type":
        log(`  action: type "${action.text}"`);
        await page.keyboard.type(action.text);
        break;
      case "hover": {
        if ("selector" in action) {
          const idx = action.index ?? 0;
          const pos = await page.evaluate(
            ([sel, i]) => {
              const els = document.querySelectorAll(sel);
              const el = els[i];
              if (!el) return null;
              const rect = el.getBoundingClientRect();
              return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
            },
            [action.selector, idx]
          );
          if (pos) {
            log(`  action: hover "${action.selector}"[${idx}] \u2192 (${pos.x}, ${pos.y})`);
            await page.mouse.move(pos.x, pos.y);
          } else {
            log(`  action: hover "${action.selector}"[${idx}] \u2014 not found`);
          }
        } else {
          log(`  action: hover (${action.x}, ${action.y})`);
          await page.mouse.move(action.x, action.y);
        }
        break;
      }
      case "click":
        log(`  action: click (${action.x}, ${action.y})`);
        await page.mouse.click(action.x, action.y, { button: action.button ?? "left" });
        break;
      case "drag": {
        log(`  action: drag (${action.from}) \u2192 (${action.to}) ${action.duration}ms`);
        const button = action.button ?? "left";
        await page.mouse.move(action.from[0], action.from[1]);
        await page.mouse.down({ button });
        const steps = Math.ceil(action.duration / 16);
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const x = action.from[0] + t * (action.to[0] - action.from[0]);
          const y = action.from[1] + t * (action.to[1] - action.from[1]);
          await page.mouse.move(x, y);
          await sleep(16);
        }
        await page.mouse.up({ button });
        break;
      }
    }
  }
}
function encodeGif(frames, path, width, height, fps, loop, log) {
  log(`Encoding GIF: ${frames.length} frames...`);
  const gif = GIFEncoder();
  const delay = Math.round(1e3 / fps);
  for (const frame of frames) {
    const png = PNG.sync.read(frame);
    const { data } = png;
    const palette = quantize(data, 256);
    const index = applyPalette(data, palette);
    gif.writeFrame(index, width, height, { palette, delay });
  }
  gif.finish();
  writeFileSync(path, gif.bytesView());
  if (!loop) {
  }
  log(`Saved screencast: ${path}`);
}
function hasAnimateAction(actions) {
  return actions.some((a) => a.type === "animate");
}
var VIDEO_EXTS = [".mp4", ".mkv", ".mov", ".webm"];
function isVideoExt(path) {
  return VIDEO_EXTS.some((ext) => path.endsWith(ext));
}
function codecForExt(path) {
  if (path.endsWith(".webm")) return "libvpx-vp9";
  return "libx264";
}
function assertFfmpeg() {
  try {
    execFileSync("ffmpeg", ["-version"], { stdio: "ignore" });
  } catch {
    throw new Error("ffmpeg not found. Install it to use video output:\n  brew install ffmpeg    # macOS\n  apt install ffmpeg     # Ubuntu/Debian");
  }
}
function createGifSink(path, width, height, fps, loop, log) {
  const frames = [];
  return {
    write(frame) {
      frames.push(frame);
    },
    finish() {
      encodeGif(frames, path, width, height, fps, loop, log);
    }
  };
}
function createVideoSink(path, fps, crf, log) {
  assertFfmpeg();
  const codec = codecForExt(path);
  const args = [
    "-y",
    "-f",
    "image2pipe",
    "-framerate",
    String(fps),
    "-i",
    "-",
    "-c:v",
    codec,
    "-pix_fmt",
    "yuv420p"
  ];
  if (codec === "libvpx-vp9") {
    args.push("-crf", String(crf), "-b:v", "0");
  } else {
    args.push("-crf", String(crf));
  }
  args.push(path);
  const ffmpeg = spawn("ffmpeg", args, { stdio: ["pipe", "ignore", "pipe"] });
  let stderr = "";
  ffmpeg.stderr.on("data", (data) => {
    stderr += data.toString();
  });
  return {
    write(frame) {
      ffmpeg.stdin.write(frame);
    },
    async finish() {
      ffmpeg.stdin.end();
      await new Promise((resolve2, reject) => {
        ffmpeg.on("close", (code) => {
          if (code === 0) {
            log(`Saved screencast: ${path}`);
            resolve2();
          } else {
            reject(new Error(`ffmpeg exited with code ${code}: ${stderr}`));
          }
        });
        ffmpeg.on("error", reject);
      });
    }
  };
}
function createSink(path, width, height, config, log) {
  const { fps = 15, loop = true, videoCrf = 23 } = config;
  if (isVideoExt(path)) {
    return createVideoSink(path, fps, videoCrf, log);
  }
  return createGifSink(path, width, height, fps, loop, log);
}
async function recordFrameByFrame(page, config, path, width, height, log, screenshotTimeout) {
  const { actions, fps = 15 } = config;
  const sink = createSink(path, width, height, config, log);
  const ssOpts = screenshotTimeout ? { timeout: screenshotTimeout } : void 0;
  log(`Recording frame-by-frame screencast...`);
  for (const action of actions) {
    switch (action.type) {
      case "animate": {
        log(`  animate: ${action.frames} frames`);
        for (let i = 0; i < action.frames; i++) {
          await page.evaluate(`(${action.eval})(${i}, ${action.frames})`);
          await page.evaluate(() => new Promise(
            (r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))
          ));
          if (action.frameDelay) await sleep(action.frameDelay);
          const frame = await page.screenshot(ssOpts);
          sink.write(frame);
          if ((i + 1) % 10 === 0 || i === action.frames - 1) {
            log(`    frame ${i + 1}/${action.frames}`);
          }
        }
        break;
      }
      case "wait": {
        const staticFrames = Math.ceil(action.duration * fps / 1e3);
        log(`  wait: ${action.duration}ms (${staticFrames} static frames)`);
        const frame = await page.screenshot(ssOpts);
        for (let i = 0; i < staticFrames; i++) sink.write(frame);
        break;
      }
      default:
        await executeActions(page, [action], log);
        break;
    }
  }
  await sink.finish();
}
async function recordScreencastRealtime(page, config, path, width, height, log, screenshotTimeout) {
  const { actions, fps = 15 } = config;
  const frameInterval = 1e3 / fps;
  const sink = createSink(path, width, height, config, log);
  const ssOpts = screenshotTimeout ? { timeout: screenshotTimeout } : void 0;
  await page.evaluate(() => document.dispatchEvent(new Event("scrns:capture-start")));
  let recording = true;
  const captureLoop = (async () => {
    while (recording) {
      const start = Date.now();
      const frame = await page.screenshot(ssOpts);
      sink.write(frame);
      const elapsed = Date.now() - start;
      if (elapsed < frameInterval) await sleep(frameInterval - elapsed);
    }
  })();
  await executeActions(page, actions, log);
  recording = false;
  await captureLoop;
  await sink.finish();
}
var SWIFTSHADER_ARGS = ["--use-angle=swiftshader", "--use-gl=swiftshader"];
async function takeScreenshots(screens, options) {
  const {
    baseUrl,
    outputDir,
    defaultSelector,
    defaultLoadTimeout = DEFAULT_LOAD_TIMEOUT,
    defaultDownloadSleep = DEFAULT_DOWNLOAD_SLEEP,
    defaultScreenshotTimeout = DEFAULT_SCREENSHOT_TIMEOUT,
    include,
    log = console.log
  } = options;
  const defaultHeadless = options.headless ?? true;
  const engine = options.engine ?? await resolveEngine();
  const entries = Object.entries(screens).filter(([name]) => !include || name.match(include));
  const groups = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    const headless = entry[1].headless ?? defaultHeadless;
    if (!groups.has(headless)) groups.set(headless, []);
    groups.get(headless).push(entry);
  }
  for (const [headless, groupEntries] of groups) {
    const perShotArgs = groupEntries.flatMap(([, s]) => s.browserArgs ?? []);
    let args = [
      ...BASE_BROWSER_ARGS,
      ...options.browserArgs ?? [],
      ...perShotArgs
    ];
    if (!headless) {
      const explicitArgs = new Set(groupEntries.flatMap(([, s]) => s.browserArgs ?? []));
      args = args.filter((a) => !SWIFTSHADER_ARGS.includes(a) || explicitArgs.has(a));
    }
    const browser = await engine.launch({ headless, args });
    const page = await browser.newPage();
    try {
      for (const [name, config] of groupEntries) {
        const screenshotTimeout = config.screenshotTimeout ?? defaultScreenshotTimeout;
        const ssOpts = { timeout: screenshotTimeout };
        const {
          path: configPath,
          query = "",
          width = DEFAULT_WIDTH,
          height = DEFAULT_HEIGHT,
          selector = defaultSelector,
          loadTimeout = defaultLoadTimeout,
          preScreenshotSleep = 0,
          scrollY = 0,
          scrollTo,
          scrollOffset = 0,
          download = false,
          downloadSleep = defaultDownloadSleep
        } = config;
        const url = `${baseUrl}/${query}`;
        const defaultExt = isScreencast(config) ? ".gif" : ".png";
        const defaultPath = `${name}${defaultExt}`;
        const path = configPath ? isAbsolute(configPath) ? configPath : resolve(outputDir, configPath) : resolve(outputDir, defaultPath);
        mkdirSync(dirname(path), { recursive: true });
        if (download) {
          log(`Setting download behavior to ${outputDir}`);
          await page.setDownloadPath(outputDir);
        }
        log(`Loading ${url}`);
        await page.goto(url);
        log(`Loaded ${url}`);
        await page.setViewportSize({ width, height });
        log("Set viewport");
        if (selector) {
          await page.waitForSelector(selector, { timeout: loadTimeout });
          log(`Found selector: ${selector}`);
        }
        if (scrollTo) {
          const scrolled = await page.evaluate(
            ([sel, offset]) => {
              const el = document.querySelector(sel);
              if (!el) return null;
              const rect = el.getBoundingClientRect();
              const y = window.scrollY + rect.top - offset;
              window.scrollTo(0, y);
              return y;
            },
            [scrollTo, scrollOffset]
          );
          if (scrolled !== null) {
            log(`Scrolled to ${scrollTo} at Y: ${scrolled}`);
          } else {
            log(`Warning: scrollTo selector "${scrollTo}" not found`);
          }
        } else if (scrollY > 0) {
          await page.evaluate((y) => window.scrollTo(0, y), scrollY);
          log(`Scrolled to Y: ${scrollY}`);
        }
        if (preScreenshotSleep > 0) {
          await sleep(preScreenshotSleep);
        }
        if (download) {
          await sleep(downloadSleep);
          log("Download complete");
        } else if (isScreencast(config)) {
          if (hasAnimateAction(config.actions)) {
            await recordFrameByFrame(page, config, path, width, height, log, screenshotTimeout);
          } else {
            await recordScreencastRealtime(page, config, path, width, height, log, screenshotTimeout);
          }
        } else {
          ssOpts.path = path;
          await page.screenshot(ssOpts);
          log(`Saved screenshot: ${path}`);
        }
      }
    } finally {
      await browser.close();
    }
  }
}
function sleep(ms) {
  return new Promise((resolve2) => setTimeout(resolve2, ms));
}
async function previewScreenshot(config, options) {
  const {
    baseUrl,
    outputDir,
    defaultSelector,
    defaultLoadTimeout = DEFAULT_LOAD_TIMEOUT,
    log = (...args2) => console.error(...args2)
  } = options;
  const {
    path: configPath,
    query = "",
    width = DEFAULT_WIDTH,
    height = DEFAULT_HEIGHT,
    selector = defaultSelector,
    loadTimeout = defaultLoadTimeout
  } = config;
  const url = `${baseUrl}/${query}`;
  const engine = options.engine ?? await resolveEngine();
  const args = [
    ...BASE_BROWSER_ARGS,
    ...options.browserArgs ?? [],
    ...config.browserArgs ?? []
  ];
  const browser = await engine.launch({ headless: false, args });
  const page = await browser.newPage();
  try {
    await page.setViewportSize({ width, height });
    log(`Loading ${url}`);
    await page.goto(url);
    if (selector) {
      await page.waitForSelector(selector, { timeout: loadTimeout });
      log(`Found selector: ${selector}`);
    }
    await page.evaluate(() => {
      window.addEventListener("keydown", (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === "S") {
          e.preventDefault();
          window.__scrns_capture = true;
        }
      });
    });
    log("Press Enter here or Ctrl+Shift+S in the browser to capture");
    await Promise.race([
      new Promise((resolve2) => {
        process.stdin.setRawMode?.(false);
        process.stdin.once("data", () => resolve2());
      }),
      (async () => {
        while (true) {
          const captured = await page.evaluate(() => window.__scrns_capture);
          if (captured) return;
          await sleep(200);
        }
      })()
    ]);
    const state = await page.evaluate(() => ({
      url: window.location.href,
      query: window.location.search + window.location.hash,
      width: window.innerWidth,
      height: window.innerHeight
    }));
    const defaultPath = `preview.png`;
    const outPath = configPath ? isAbsolute(configPath) ? configPath : resolve(outputDir, configPath) : resolve(outputDir, defaultPath);
    mkdirSync(dirname(outPath), { recursive: true });
    await page.screenshot({ path: outPath });
    log(`Saved screenshot: ${outPath}`);
    return state;
  } finally {
    await browser.close();
  }
}
export {
  isScreencast,
  parseConfig,
  previewScreenshot,
  resolveBaseUrl,
  resolveEngine,
  takeScreenshots
};
