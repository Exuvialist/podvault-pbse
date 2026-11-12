/**
 * SecurePdfViewer — renders one page at a time into a canvas (never an object URL),
 * bakes a forensic watermark into the pixels, and blocks the obvious exfiltration paths.
 *
 * Honest scope: no browser can stop a physical camera or an OS-level screenshot tool.
 * The watermark exists so that a leaked copy is attributable.
 */
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

type PdfJs = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<PdfJs> | null = null;

/** Lazy: PDF.js is ~350KB and only needed once a document is opened. */
async function loadPdfjs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then((mod) => {
      mod.GlobalWorkerOptions.workerSrc = workerSrc;
      return mod;
    });
  }
  return pdfjsPromise;
}

export interface WatermarkInfo {
  webId: string;
  ip: string;
  at: string;
}

export interface ViewerState {
  page: number;
  pages: number;
  zoom: number;
  loading: boolean;
  error: string | null;
}

export interface ViewerOptions {
  watermark: WatermarkInfo;
  hideOnBlur?: boolean;
  onState?: (state: ViewerState) => void;
}

const MIN_ZOOM = 0.6;
const MAX_ZOOM = 3;

export class SecurePdfViewer {
  private pdf: PDFDocumentProxy | null = null;
  private loadingTask: PDFDocumentLoadingTask | null = null;
  private page = 1;
  private zoom = 1;
  private task: RenderTask | null = null;
  private destroyed = false;
  private readonly listeners: Array<[EventTarget, string, EventListener]> = [];
  private readonly viewport: HTMLElement;
  private readonly stage: HTMLElement;
  private readonly canvasWrap: HTMLElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly overlay: HTMLElement;
  private readonly veil: HTMLElement;
  private readonly toolbar: HTMLElement;

  constructor(
    private readonly host: HTMLElement,
    private readonly bytes: Uint8Array,
    private readonly opts: ViewerOptions,
  ) {
    host.replaceChildren();
    host.classList.add('viewer');

    this.viewport = document.createElement('div');
    this.viewport.className = 'viewer-viewport';

    this.stage = document.createElement('div');
    this.stage.className = 'viewer-stage';

    this.canvasWrap = document.createElement('div');
    this.canvasWrap.className = 'viewer-canvas-wrap';

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'viewer-canvas';
    this.canvas.setAttribute('role', 'img');
    this.canvas.setAttribute('aria-label', 'Pratinjau dokumen (hanya lihat)');

    this.overlay = document.createElement('div');
    this.overlay.className = 'watermark-layer';
    this.overlay.setAttribute('aria-hidden', 'true');

    this.canvasWrap.append(this.canvas, this.overlay);
    this.stage.append(this.canvasWrap);

    this.veil = document.createElement('div');
    this.veil.className = 'viewer-veil';
    this.veil.hidden = true;
    this.veil.innerHTML = '<span class="viewer-veil-icon" aria-hidden="true">◈</span><span class="viewer-veil-text">Dokumen disembunyikan untuk privasi.</span><span class="viewer-veil-hint">Klik di mana saja atau fokuskan jendela untuk melanjutkan.</span>';

    this.viewport.append(this.stage, this.veil);

    this.toolbar = document.createElement('div');
    this.toolbar.className = 'viewer-toolbar';

    host.append(this.viewport, this.toolbar);

    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('canvas-tidak-tersedia');
    this.ctx = ctx;
  }

  async mount(): Promise<void> {
    this.installGuards();
    await this.load();
  }

  async load(): Promise<void> {
    try {
      this.emit({ loading: true, error: null });
      const pdfjs = await loadPdfjs();
      const task = pdfjs.getDocument({ data: this.bytes.slice() });
      this.loadingTask = task;
      const doc = await task.promise;
      if (this.destroyed) {
        void task.destroy();
        return;
      }
      this.pdf = doc;
      this.page = 1;
      await this.render();
    } catch (err) {
      this.emit({ loading: false, error: err instanceof Error ? err.message : 'gagal-memuat' });
    }
  }

  async goTo(page: number): Promise<void> {
    if (!this.pdf) return;
    const next = Math.min(Math.max(1, Math.round(page)), this.pdf.numPages);
    if (next === this.page) return;
    this.page = next;
    await this.render();
  }

  async next(): Promise<void> {
    await this.goTo(this.page + 1);
  }

  async prev(): Promise<void> {
    await this.goTo(this.page - 1);
  }

  async setZoom(zoom: number): Promise<void> {
    this.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    await this.render();
  }

  get state(): ViewerState {
    return {
      page: this.page,
      pages: this.pdf?.numPages ?? 0,
      zoom: this.zoom,
      loading: false,
      error: null,
    };
  }

  destroy(): void {
    this.destroyed = true;
    this.task?.cancel();
    this.task = null;
    for (const [target, type, fn] of this.listeners) {
      target.removeEventListener(type, fn, true);
      target.removeEventListener(type, fn, false);
    }
    this.listeners.length = 0;
    void this.loadingTask?.destroy();
    this.loadingTask = null;
    this.pdf = null;
    this.host.replaceChildren();
    this.host.classList.remove('viewer');
  }

  // ---------------------------------------------------------------- rendering

  private async render(): Promise<void> {
    const pdf = this.pdf;
    if (!pdf || this.destroyed) return;
    this.task?.cancel();

    this.emit({ loading: true });
    try {
      const page = await pdf.getPage(this.page);
      if (this.destroyed) return;

      const unscaled = page.getViewport({ scale: 1 });
      const stageWidth = Math.max(280, this.stage.clientWidth - 32);
      const fit = stageWidth / unscaled.width;
      const scale = fit * this.zoom;
      const viewport = page.getViewport({ scale });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      this.canvas.width = Math.floor(viewport.width * dpr);
      this.canvas.height = Math.floor(viewport.height * dpr);
      this.canvas.style.width = `${Math.floor(viewport.width)}px`;
      this.canvas.style.height = `${Math.floor(viewport.height)}px`;

      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      const task = page.render({
        canvas: this.canvas,
        canvasContext: ctx,
        viewport,
        transform: dpr === 1 ? undefined : [dpr, 0, 0, dpr, 0, 0],
      });
      this.task = task;
      await task.promise;
      if (this.destroyed) return;

      this.paintWatermark();
      this.paintOverlay();
      this.renderToolbar();
      this.emit({ loading: false, page: this.page, pages: pdf.numPages, zoom: this.zoom, error: null });
    } catch (err) {
      if (err instanceof Error && err.name === 'RenderingCancelledException') return;
      this.emit({ loading: false, error: err instanceof Error ? err.message : 'gagal-render' });
    }
  }

  /** Burn the forensic mark into the pixels so a raw canvas capture still carries it. */
  private paintWatermark(): void {
    const { width, height } = this.canvas;
    const ctx = this.ctx;
    const wm = this.opts.watermark;
    const text = `${wm.webId} | ${wm.ip} | ${wm.at}`;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.save();
    ctx.rotate((-25 * Math.PI) / 180);
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#8a1c1c';
    ctx.font = `600 ${Math.max(11, Math.round(width / 85))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.textBaseline = 'middle';

    const stepX = ctx.measureText(text).width + Math.round(width / 12);
    const stepY = Math.max(56, Math.round(height / 16));
    for (let y = -height; y < height * 2; y += stepY) {
      for (let x = -width; x < width * 2; x += stepX) {
        ctx.fillText(text, x, y);
      }
    }
    ctx.restore();
  }

  /** A second, live layer that survives zoom and DOM screenshots. */
  private paintOverlay(): void {
    const wm = this.opts.watermark;
    const label = `${wm.webId} · ${wm.ip} · ${wm.at}`;
    this.overlay.replaceChildren();
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 3; col++) {
        const span = document.createElement('span');
        span.className = 'watermark-cell';
        span.textContent = label;
        span.style.top = `${row * 18 + 4}%`;
        span.style.left = `${col * 36 - 6}%`;
        this.overlay.append(span);
      }
    }
  }

  private renderToolbar(): void {
    const pages = this.pdf?.numPages ?? 0;
    const mk = (label: string, title: string, onClick: () => void, disabled = false): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-ghost btn-sm';
      b.textContent = label;
      b.title = title;
      b.setAttribute('aria-label', title);
      b.disabled = disabled;
      b.addEventListener('click', onClick);
      return b;
    };

    const counter = document.createElement('span');
    counter.className = 'viewer-counter mono';
    counter.textContent = `${this.page} / ${pages}`;

    this.toolbar.replaceChildren(
      mk('‹', 'Halaman sebelumnya', () => void this.prev(), this.page <= 1),
      counter,
      mk('›', 'Halaman berikutnya', () => void this.next(), this.page >= pages),
      mk('−', 'Perkecil', () => void this.setZoom(this.zoom - 0.2), this.zoom <= MIN_ZOOM),
      mk('+', 'Perbesar', () => void this.setZoom(this.zoom + 0.2), this.zoom >= MAX_ZOOM),
    );
  }

  // ------------------------------------------------------------------ guards

  private installGuards(): void {
    const block = (e: Event): void => {
      e.preventDefault();
      e.stopPropagation();
    };
    const on = (target: EventTarget, type: string, fn: EventListener): void => {
      target.addEventListener(type, fn, { capture: true });
      this.listeners.push([target, type, fn]);
    };

    on(document, 'contextmenu', block);
    on(this.host, 'contextmenu', block);
    on(document, 'copy', block);
    on(document, 'cut', block);
    on(document, 'dragstart', block);
    on(document, 'selectstart', block);

    on(document, 'keydown', ((e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && ['p', 's', 'u', 'c'].includes(key)) {
        e.preventDefault();
        e.stopPropagation();
      }
      if (e.key === 'PrintScreen') {
        e.preventDefault();
        // Best effort: clear the clipboard after the OS grabbed the frame.
        void navigator.clipboard?.writeText('PodVault: tangkapan layar tercatat pada watermark.').catch(() => {});
      }
    }) as EventListener);

    if (this.opts.hideOnBlur !== false) {
      let isHidden = false;
      const hide = (): void => {
        if (this.destroyed) return;
        isHidden = true;
        this.veil.hidden = false;
      };
      const show = (): void => {
        if (this.destroyed) return;
        isHidden = false;
        this.veil.hidden = true;
      };

      on(window, 'blur', hide);
      on(window, 'focus', show);
      on(document, 'visibilitychange', () => {
        if (document.hidden) {
          hide();
        } else if (document.hasFocus()) {
          show();
        }
      });

      // User interaction anywhere inside the veil, viewport, or window restores visibility
      on(this.veil, 'pointerdown', show);
      on(this.veil, 'click', show);
      on(this.viewport, 'pointerdown', () => {
        if (isHidden) show();
      });
      on(window, 'keydown', () => {
        if (isHidden) show();
      });
    }
  }

  private emit(patch: Partial<ViewerState>): void {
    const base = this.state;
    this.opts.onState?.({ ...base, ...patch });
  }
}
