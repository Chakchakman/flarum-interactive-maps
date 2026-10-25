import Component from 'flarum/common/Component';
import { viewportLayout, clampZoom, DEFAULT_ZOOM } from '../mapViewport.mjs';
import { gridStyle, GRID_OPACITY } from '../gridStyle.mjs';

let patternSequence = 0;

/**
 * One bounded viewport for editor and in-post maps.
 *
 * The canvas uses an explicit scaled width/height (not CSS transform), so
 * getBoundingClientRect() stays correct for both existing token drag handlers.
 * Each board owns independent zoom and pan state.
 */
export default class MapBoard extends Component {
  oninit(vnode) {
    super.oninit(vnode);
    this.patternId = 'chak-map-grid-shared-' + (++patternSequence);
    this.zoomId = 'chak-map-zoom-' + patternSequence;
    this.zoom = DEFAULT_ZOOM;
    this.panX = 0;
    this.panY = 0;
    this.viewportWidth = 0;
    this.viewportHeight = 0;
    this.panDrag = null;
    this.removed = false;
  }

  oncreate(vnode) {
    super.oncreate(vnode);
    this.viewport = vnode.dom.querySelector('.ChakMap-viewport');
    this.measure();
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.measure());
      this.resizeObserver.observe(this.viewport);
    } else {
      this.resizeListener = () => this.measure();
      window.addEventListener('resize', this.resizeListener);
    }
  }

  onremove(vnode) {
    super.onremove(vnode);
    this.removed = true;
    this.resizeObserver?.disconnect();
    if (this.resizeListener) window.removeEventListener('resize', this.resizeListener);
    this.releasePanListeners();
  }

  requestRedraw() {
    if (this.removed) return;
    // Flarum CommentPost suppresses otherwise-stable subtrees.
    this.attrs.invalidateParent?.();
    m.redraw();
  }

  measure() {
    if (!this.viewport || this.removed) return;
    const rect = this.viewport.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0
        && (Math.abs(rect.width - this.viewportWidth) > 0.5
            || Math.abs(rect.height - this.viewportHeight) > 0.5)) {
      this.viewportWidth = rect.width;
      this.viewportHeight = rect.height;
      this.requestRedraw();
    }
  }

  currentLayout() {
    const { metrics } = this.attrs;
    return viewportLayout(
      metrics.width, metrics.height,
      this.viewportWidth, this.viewportHeight,
      this.zoom, this.panX, this.panY
    );
  }

  changeZoom(event) {
    this.zoom = clampZoom(event.target.value);
    const layout = this.currentLayout();
    this.panX = layout.panX;
    this.panY = layout.panY;
    this.requestRedraw();
  }

  fitMap() {
    this.zoom = DEFAULT_ZOOM;
    this.panX = 0;
    this.panY = 0;
    this.requestRedraw();
  }

  beginPan(event) {
    // Preserve normal forum scrolling with the mouse wheel and touch swipes.
    // Only a primary mouse/pen drag on background pans the map.
    if (this.panDrag || (event.pointerType !== 'mouse' && event.pointerType !== 'pen') || event.button !== 0) return;
    if (event.target.closest?.('.ChakMap-token.is-mine')) return;
    const layout = this.currentLayout();
    if (!layout.ready || (layout.width <= this.viewportWidth && layout.height <= this.viewportHeight)) return;

    event.preventDefault();
    this.panDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      panX: layout.panX,
      panY: layout.panY,
    };
    this.panMoveListener = (e) => this.movePan(e);
    this.panEndListener = (e) => this.endPan(e);
    window.addEventListener('pointermove', this.panMoveListener);
    window.addEventListener('pointerup', this.panEndListener);
    window.addEventListener('pointercancel', this.panEndListener);
  }

  movePan(event) {
    if (!this.panDrag || event.pointerId !== this.panDrag.pointerId) return;
    this.panX = this.panDrag.panX + event.clientX - this.panDrag.startX;
    this.panY = this.panDrag.panY + event.clientY - this.panDrag.startY;
    const layout = this.currentLayout();
    this.panX = layout.panX;
    this.panY = layout.panY;
    const canvas = this.viewport?.querySelector('.ChakMap-canvas');
    if (canvas) {
      canvas.style.left = layout.left + 'px';
      canvas.style.top = layout.top + 'px';
    }
  }

  endPan(event) {
    if (!this.panDrag || event.pointerId !== this.panDrag.pointerId) return;
    this.panDrag = null;
    this.releasePanListeners();
    this.requestRedraw();
  }

  releasePanListeners() {
    if (!this.panMoveListener) return;
    window.removeEventListener('pointermove', this.panMoveListener);
    window.removeEventListener('pointerup', this.panEndListener);
    window.removeEventListener('pointercancel', this.panEndListener);
    this.panMoveListener = null;
    this.panEndListener = null;
  }

  view() {
    const { map, metrics, gridPatternId, canMoveToken, onTokenPointerDown, readOnly } = this.attrs;
    const { gridColor, gridLineWidth } = gridStyle(map);
    const patternId = gridPatternId || this.patternId;
    const layout = this.currentLayout();
    if (layout.ready) {
      this.panX = layout.panX;
      this.panY = layout.panY;
    }
    const canvasStyle = layout.ready ? {
      width: layout.width + 'px',
      height: layout.height + 'px',
      left: layout.left + 'px',
      top: layout.top + 'px',
    } : { width: '100%', height: '100%', left: '0', top: '0' };
    canvasStyle.backgroundImage = 'url("' + String(map.backgroundUrl || '').replace(/"/g, '%22') + '")';

    // Tokens are sized in source-image pixels to scale *with* the image,
    // not independently with the browser window.
    const tokenPixels = Math.min(128, Math.max(16, metrics.cell));
    const canPan = layout.ready && (layout.width > this.viewportWidth || layout.height > this.viewportHeight);

    return (
      <div className={'ChakMap-board' + (readOnly ? ' ChakMap-board--readonly' : '')}>
        <div className={'ChakMap-viewport' + (canPan ? ' is-pannable' : '')}
          onpointerdown={(event) => this.beginPan(event)}>
          <div className="ChakMap-canvas" style={canvasStyle}>
            {map.gridEnabled && (
              <svg className="ChakMap-grid" aria-hidden="true"
                viewBox={'0 0 ' + metrics.width + ' ' + metrics.height}
                preserveAspectRatio="none">
                <defs>
                  <pattern id={patternId} patternUnits="userSpaceOnUse"
                    x={metrics.offsetX} y={metrics.offsetY}
                    width={metrics.cell} height={metrics.cell}>
                    <path d={'M 0 0 L ' + metrics.cell + ' 0 M 0 0 L 0 ' + metrics.cell}
                      fill="none" stroke={gridColor} stroke-opacity={GRID_OPACITY} stroke-width={gridLineWidth} />
                  </pattern>
                </defs>
                <rect x="0" y="0" width={metrics.width} height={metrics.height}
                  fill={'url(#' + patternId + ')'} />
              </svg>
            )}
            {map.tokens.map((token) => {
              const movable = !readOnly && !!canMoveToken?.(token);
              return (
                <img key={token.id} draggable="false"
                  className={'ChakMap-token' + (movable ? ' is-mine' : '')}
                  src={token.imageUrl}
                  title={token.name + (token.ownerUsername ? ' (@' + token.ownerUsername + ')' : ' (без владельца)')}
                  alt={token.name}
                  style={{
                    left: token.x * 100 + '%',
                    top: token.y * 100 + '%',
                    width: tokenPixels / metrics.width * 100 + '%',
                    height: tokenPixels / metrics.height * 100 + '%',
                  }}
                  onpointerdown={movable ? (event) => {
                    event.stopPropagation();
                    onTokenPointerDown?.(event, token);
                  } : undefined}
                />
              );
            })}
          </div>
        </div>
        <div className="ChakMap-zoom">
          <label for={this.zoomId}>Масштаб</label>
          <input id={this.zoomId} type="range" min="50" max="300" step="10"
            value={this.zoom} oninput={(event) => this.changeZoom(event)}
            aria-label="Масштаб игровой карты" />
          <span className="ChakMap-zoomValue">{this.zoom}%</span>
          <button className="Button Button--small" type="button" onclick={() => this.fitMap()}>
            Вписать
          </button>
        </div>
      </div>
    );
  }
}
