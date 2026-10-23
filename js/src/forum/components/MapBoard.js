import Component from 'flarum/common/Component';

let patternSequence = 0;

// Shared, render-only tactical board. Staff editor handles pointer interaction
// through callbacks; the post version deliberately passes none.
export default class MapBoard extends Component {
  oninit(vnode) {
    super.oninit(vnode);
    this.patternId = `chak-map-grid-shared-${++patternSequence}`;
  }

  view() {
    const { map, metrics, gridPatternId, canMoveToken, onTokenPointerDown, readOnly } = this.attrs;
    const patternId = gridPatternId || this.patternId;

    return (
      <div className={`ChakMap-canvas${readOnly ? ' ChakMap-canvas--readonly' : ''}`}
        style={{
          backgroundImage: `url("${String(map.backgroundUrl || '').replace(/"/g, '%22')}")`,
          aspectRatio: metrics.aspectRatio,
        }}>
        {map.gridEnabled && (
          <svg className="ChakMap-grid" aria-hidden="true"
            viewBox={`0 0 ${metrics.width} ${metrics.height}`}
            preserveAspectRatio="none">
            <defs>
              <pattern id={patternId} patternUnits="userSpaceOnUse"
                x={metrics.offsetX} y={metrics.offsetY}
                width={metrics.cell} height={metrics.cell}>
                <path d={`M 0 0 L ${metrics.cell} 0 M 0 0 L 0 ${metrics.cell}`}
                  fill="none" stroke="rgba(255,255,255,.48)" strokeWidth="1" />
              </pattern>
            </defs>
            <rect x="0" y="0" width={metrics.width} height={metrics.height}
              fill={`url(#${patternId})`} />
          </svg>
        )}
        {map.tokens.map((token) => {
          const movable = !readOnly && !!canMoveToken?.(token);
          return (
            <img key={token.id} draggable="false"
              className={`ChakMap-token${movable ? ' is-mine' : ''}`}
              src={token.imageUrl}
              title={`${token.name}${token.ownerUsername ? ` (@${token.ownerUsername})` : ' (без владельца)'}`}
              alt={token.name}
              style={{ left: `${token.x * 100}%`, top: `${token.y * 100}%` }}
              onpointerdown={movable ? (event) => onTokenPointerDown?.(event, token) : undefined}
            />
          );
        })}
      </div>
    );
  }
}
