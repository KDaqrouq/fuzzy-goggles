import { cpSync, createWriteStream, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { get } from 'node:https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, 'public', 'wasm');
const outFile = join(outDir, 'hand_landmarker.task');
const mpWasm = join(root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
const url =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/latest/hand_landmarker.task';

mkdirSync(outDir, { recursive: true });

if (existsSync(mpWasm) && !existsSync(join(outDir, 'vision_wasm_internal.wasm'))) {
  cpSync(mpWasm, outDir, { recursive: true });
  console.log('Copied MediaPipe wasm assets to public/wasm/');
}

if (existsSync(outFile)) {
  process.exit(0);
}

function download(src, dest) {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    get(src, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const loc = res.headers.location;
        file.close();
        if (!loc) return reject(new Error('Redirect without location'));
        return resolve(download(loc, dest));
      }
      if (res.statusCode !== 200) {
        file.close();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
    }).on('error', reject);
  });
}

await download(url, outFile);
console.log('Downloaded hand_landmarker.task to public/wasm/');
