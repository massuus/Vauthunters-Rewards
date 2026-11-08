import PREVIEWS from './reward-model-catalog.js';
import INDIVIDUAL_PREVIEWS from './individual-reward-model-catalog.js';

export function renderRewardModelPreview(key, fallback, images = []) {
  const preview = PREVIEWS[key];
  if (!preview) return fallback;
  const { model, companion, firstImageOnly, separateArtwork, additionalModel } = preview;
  const wrap = (art, modelName = model, isCompanion = companion) =>
    `<reward-model-preview data-model="${modelName}" ${isCompanion ? 'data-companion' : ''}>${art}</reward-model-preview>`;
  if (additionalModel) {
    return `<div class="reward-model-mixed">${wrap('')}${wrap('', additionalModel, false)}</div>`;
  }
  if (firstImageOnly && images.length > 1) {
    return `<div class="reward-model-mixed">${wrap('')}${images.slice(1).join('')}</div>`;
  }
  if (separateArtwork) {
    return `<div class="reward-model-mixed">${wrap('')}<div class="reward-model-artwork">${fallback}</div></div>`;
  }
  return wrap('');
}

export function renderIndividualRewardModelPreview(path) {
  const preview = INDIVIDUAL_PREVIEWS[String(path || '').toLowerCase()];
  if (!preview) return '';
  const piece = preview.outfitPiece === null ? '' : ` data-outfit-piece="${preview.outfitPiece}"`;
  return `<reward-model-preview data-model="${preview.model}" data-model-index="${preview.modelIndex}"${piece}${preview.companion ? ' data-companion' : ''}></reward-model-preview>`;
}

export function initRewardModelPreviews() {
  if (!window.customElements || customElements.get('reward-model-preview')) return;
  customElements.define(
    'reward-model-preview',
    class extends HTMLElement {
      connectedCallback() {
        const lifetime = new AbortController();
        this.lifetime = lifetime;
        this.observer = new IntersectionObserver(
          async ([entry]) => {
            if (lifetime.signal.aborted || !entry.isIntersecting || this.loading) return;
            this.loading = true;
            this.observer.disconnect();
            try {
              const { mountRewardModel } = await import('./reward-model-renderer.js');
              if (this.isConnected && !lifetime.signal.aborted) {
                const dispose = await mountRewardModel(this, lifetime.signal);
                if (lifetime.signal.aborted) dispose();
                else this.disposePreview = dispose;
              }
            } catch {
              // Leave the preview empty when WebGL or model loading is unavailable.
            }
          },
          { rootMargin: '100px' }
        );
        this.observer.observe(this);
      }

      disconnectedCallback() {
        this.lifetime?.abort();
        this.observer?.disconnect();
        this.disposePreview?.();
        this.disposePreview = null;
        this.loading = false;
      }
    }
  );
}
