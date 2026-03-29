import overlayCss from './overlay.css?raw';
import { classifyLandmarks, mockPredict, type Prediction } from './classifier';
import { HandPipeline } from './handPipeline';
import { PHRASES } from './phrases';

const HOST_ID = 'asl-meet-captions-host';
const STORAGE_MOCK = 'asl_mvp_mock';
const HIGH_CONFIDENCE = 0.66;
const SUBTITLE_MS = 4000;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function isTypingTarget(t: EventTarget | null): boolean {
  if (!t || !(t instanceof HTMLElement)) return false;
  return !!t.closest('input, textarea, [contenteditable="true"]');
}

class MeetCaptionsApp {
  private pipeline = new HandPipeline();
  private mockTick = 0;
  private rafId = 0;
  private fadeTimer: ReturnType<typeof setTimeout> | null = null;
  private subtitleClearTimer: ReturnType<typeof setTimeout> | null = null;
  private triggerLock = false;

  private video!: HTMLVideoElement;
  private statusEl!: HTMLElement;
  private subtitleEl!: HTMLElement;
  private subtitleWrap!: HTMLElement;
  private fallbackEl: HTMLElement | null = null;
  private mockCheckbox!: HTMLInputElement;

  async mount(root: HTMLElement): Promise<void> {
    const panel = el('div', 'asl-panel');
    this.video = el('video', '') as HTMLVideoElement;
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    this.video.playsInline = true;

    const translateBtn = el('button', '', 'Translate');
    translateBtn.type = 'button';
    translateBtn.addEventListener('click', () => this.onTranslate());

    const row = el('div', 'asl-row');
    row.appendChild(translateBtn);

    this.statusEl = el('div', 'asl-status', 'Starting camera…');

    this.mockCheckbox = document.createElement('input');
    this.mockCheckbox.type = 'checkbox';
    this.mockCheckbox.id = 'asl-mock';
    this.mockCheckbox.checked = localStorage.getItem(STORAGE_MOCK) === '1';
    this.mockCheckbox.addEventListener('change', () => {
      localStorage.setItem(STORAGE_MOCK, this.mockCheckbox.checked ? '1' : '0');
      this.setStatus(
        this.mockCheckbox.checked
          ? 'Simulated phrases (for UI rehearsal).'
          : this.pipeline.ready
            ? 'Live hand model ready.'
            : this.pipeline.initError
              ? `Vision init failed: ${this.pipeline.initError}`
              : '…',
      );
    });

    const mockLabel = el('label', 'mock');
    mockLabel.htmlFor = 'asl-mock';
    mockLabel.appendChild(this.mockCheckbox);
    mockLabel.appendChild(document.createTextNode('Simulate phrases (no ML)'));

    panel.appendChild(this.video);
    panel.appendChild(row);
    panel.appendChild(this.statusEl);
    panel.appendChild(mockLabel);

    this.subtitleWrap = el('div', 'asl-subtitle-wrap');
    this.subtitleEl = el('div', 'asl-subtitle', '');
    this.subtitleWrap.appendChild(this.subtitleEl);

    root.appendChild(panel);
    root.appendChild(this.subtitleWrap);

    await this.pipeline.init();
    if (this.pipeline.initError) {
      this.setStatus(`Hand model failed to load (${this.pipeline.initError}). Mock mode or retry reload.`);
    } else {
      this.setStatus('Camera starting…');
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 360 } },
        audio: false,
      });
      this.video.srcObject = stream;
      await this.video.play();
      this.setStatus(
        this.mockCheckbox.checked
          ? 'Simulated phrases — press Space or Translate.'
          : this.pipeline.ready
            ? 'Show your phrase, then Space or Translate.'
            : 'Vision unavailable — enable Simulate or reload extension.',
      );
      this.startFrameLoop();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.setStatus(`Camera blocked: ${msg}. Allow webcam for meet.google.com.`);
    }

    window.addEventListener('keydown', this.onGlobalKeydown, true);
  }

  private startFrameLoop(): void {
    const loop = () => {
      if (this.pipeline.ready && !this.mockCheckbox.checked) {
        this.pipeline.processFrame(this.video);
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  private onGlobalKeydown = (e: KeyboardEvent): void => {
    if (e.code !== 'Space' || e.repeat) return;
    if (isTypingTarget(e.target)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    void this.onTranslate();
  };

  private setStatus(text: string): void {
    this.statusEl.textContent = text;
  }

  private async onTranslate(): Promise<void> {
    if (this.triggerLock) return;
    this.triggerLock = true;
    setTimeout(() => {
      this.triggerLock = false;
    }, 400);

    this.closeFallback();
    this.setStatus('Translating…');

    let prediction: Prediction;

    if (this.mockCheckbox.checked) {
      prediction = mockPredict(this.mockTick++);
    } else if (!this.pipeline.ready) {
      prediction = { index: 0, caption: PHRASES[0], confidence: 0.2 };
    } else {
      const lm = this.pipeline.getAveragedLandmarks();
      if (!lm) {
        prediction = { index: 0, caption: PHRASES[0], confidence: 0.18 };
      } else {
        prediction = classifyLandmarks(lm);
      }
    }

    this.setStatus(
      this.mockCheckbox.checked
        ? 'Simulated phrase.'
        : 'Hold a clear pose, then translate again if needed.',
    );

    if (prediction.confidence >= HIGH_CONFIDENCE) {
      this.showSubtitle(prediction.caption);
    } else {
      this.showFallback(prediction);
    }
  }

  private showSubtitle(caption: string): void {
    if (this.fadeTimer) clearTimeout(this.fadeTimer);
    if (this.subtitleClearTimer) clearTimeout(this.subtitleClearTimer);

    this.subtitleEl.classList.remove('asl-fade');
    this.subtitleEl.textContent = caption;
    this.subtitleWrap.style.display = 'block';

    this.fadeTimer = setTimeout(() => {
      this.subtitleEl.classList.add('asl-fade');
    }, SUBTITLE_MS);

    this.subtitleClearTimer = setTimeout(() => {
      this.subtitleEl.textContent = '';
      this.subtitleWrap.style.display = 'none';
      this.subtitleEl.classList.remove('asl-fade');
    }, SUBTITLE_MS + 500);
  }

  private showFallback(pred: Prediction): void {
    this.closeFallback();
    const card = el('div', 'asl-fallback');
    card.innerHTML = '';

    const h = el('h3', '', 'Low confidence');
    const guess = el('div', 'asl-guess');
    guess.textContent = `Best guess: ${pred.caption}`;

    const actions = el('div', 'asl-actions');
    const confirmBtn = el('button', 'confirm', 'Confirm');
    confirmBtn.addEventListener('click', () => {
      this.showSubtitle(pred.caption);
      this.closeFallback();
    });
    const retryBtn = el('button', 'retry', 'Retry');
    retryBtn.addEventListener('click', () => {
      this.pipeline.clearBuffer();
      this.closeFallback();
      this.setStatus('Try again — adjust your hands, then Translate or Space.');
    });
    actions.appendChild(confirmBtn);
    actions.appendChild(retryBtn);

    const chooseLabel = el('div', 'asl-guess');
    chooseLabel.textContent = 'Or choose a phrase:';

    const select = document.createElement('select');
    PHRASES.forEach((p, i) => {
      const opt = document.createElement('option');
      opt.value = String(i);
      opt.textContent = p;
      if (i === pred.index) opt.selected = true;
      select.appendChild(opt);
    });

    const chooseRow = el('div', 'choose-row');
    const applyBtn = el('button', '', 'Use selection');
    applyBtn.addEventListener('click', () => {
      const i = Number(select.value);
      const cap = PHRASES[i] ?? pred.caption;
      this.showSubtitle(cap);
      this.closeFallback();
    });
    chooseRow.appendChild(applyBtn);

    card.appendChild(h);
    card.appendChild(guess);
    card.appendChild(actions);
    card.appendChild(chooseLabel);
    card.appendChild(select);
    card.appendChild(chooseRow);

    const host = document.getElementById(HOST_ID);
    host?.appendChild(card);
    this.fallbackEl = card;
  }

  private closeFallback(): void {
    this.fallbackEl?.remove();
    this.fallbackEl = null;
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onGlobalKeydown, true);
    cancelAnimationFrame(this.rafId);
    const stream = this.video?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (this.fadeTimer) clearTimeout(this.fadeTimer);
    if (this.subtitleClearTimer) clearTimeout(this.subtitleClearTimer);
    this.closeFallback();
  }
}

function main(): void {
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement('div');
  host.id = HOST_ID;
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = overlayCss;
  shadow.appendChild(style);

  const inner = document.createElement('div');
  inner.setAttribute('data-asl-overlay', '1');
  shadow.appendChild(inner);

  const app = new MeetCaptionsApp();
  void app.mount(inner);
}

main();
