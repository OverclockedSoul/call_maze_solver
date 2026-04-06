import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const repoRoot = process.cwd();
const fixturePath = path.join(repoRoot, "data", "dev-runtime", "browser-live-smoke-input.b64");
const fixtureBase64 = (await fs.readFile(fixturePath, "utf8")).trim();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

await page.addInitScript(
  ({ base64Audio }) => {
    const taskPrompt = "Eres un agente humano de AXA Espana especializado en siniestros. Estas en una llamada telefonica real. Atiende de forma breve, natural y profesional. Si la persona que llama se identifica con nombre completo y NIF y pregunta por el incidente B5341, informa de que la indemnizacion ya se ha tramitado y aparecera en la cuenta bancaria en 2 dias laborables.";
    window.sessionStorage.setItem("call-maze-browser-live", JSON.stringify({ task_prompt: taskPrompt }));

    const decodeBase64ToFloat32 = (value) => {
      const binary = window.atob(value);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      const view = new DataView(bytes.buffer);
      const samples = new Float32Array(bytes.byteLength / 2);
      for (let i = 0; i < samples.length; i += 1) {
        samples[i] = view.getInt16(i * 2, true) / 0x8000;
      }
      return samples;
    };

    const sourceSamples = decodeBase64ToFloat32(base64Audio);
    window.__smokeMediaState = null;

    navigator.mediaDevices ??= {};
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AudioContext({ sampleRate: 24000 });
      await ctx.resume();
      const destination = ctx.createMediaStreamDestination();
      const buffer = ctx.createBuffer(1, sourceSamples.length, 24000);
      const channel = buffer.getChannelData(0);
      for (let i = 0; i < sourceSamples.length; i += 1) {
        channel[i] = sourceSamples[i];
      }
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(destination);
      window.__smokeMediaState = { ctx, destination, source };
      window.setTimeout(() => {
        source.start();
      }, 1800);
      return destination.stream;
    };
    window.__browserLiveSmoke = true;
  },
  { base64Audio: fixtureBase64 },
);

page.on("console", (msg) => {
  console.log(`[console:${msg.type()}] ${msg.text()}`);
});

await page.goto("http://127.0.0.1:5173/browser-live", { waitUntil: "networkidle" });
await page.getByTestId("browser-live-toggle").click();

await page.waitForFunction(
  () => document.querySelectorAll('[data-testid="browser-live-message-assistant"]').length > 0,
  { timeout: 120000 },
);

const pageText = await page.textContent("body");
console.log(pageText ?? "");

const assistantMessages = await page.locator('[data-testid="browser-live-message-assistant"]').allTextContents();
if (!pageText || !pageText.includes("Laura") || assistantMessages.length === 0 || !assistantMessages[0]?.trim()) {
  await browser.close();
  throw new Error("Browser live smoke test did not observe a bot response.");
}

await browser.close();
