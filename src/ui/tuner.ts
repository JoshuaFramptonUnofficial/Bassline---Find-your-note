export function tunerMarkup(): string {
  const ticks = Array.from({ length: 21 }, (_, i) => {
    const angle = (-90 + i * 9) * Math.PI / 180;
    const big = i % 5 === 0;
    const r1 = big ? 111 : 117;
    const r2 = 125;
    return `<line x1="${160 + Math.sin(angle) * r1}" y1="${155 - Math.cos(angle) * r1}" x2="${160 + Math.sin(angle) * r2}" y2="${155 - Math.cos(angle) * r2}" class="dial-tick ${big ? 'major' : ''}"/>`;
  }).join('');
  return `<svg class="tuner-dial" viewBox="0 0 320 185" aria-hidden="true">
    <path d="M25 155 A135 135 0 0 1 295 155" class="dial-track"/>
    <path id="tolerance-arc" d="M90 40 A135 135 0 0 1 230 40" class="dial-band"/>
    ${ticks}
    <text x="26" y="180">−100</text><text x="160" y="12">0</text><text x="294" y="180">+100</text>
    <g id="needle" class="needle" style="opacity: .25"><path d="M157 155 160 48 163 155Z"/><circle cx="160" cy="155" r="7"/></g>
  </svg>`;
}

export function setToleranceArc(element: SVGPathElement, cents: number): void {
  const angle = cents / 100 * Math.PI / 2;
  const x = 135 * Math.sin(angle);
  const y = 155 - 135 * Math.cos(angle);
  element.setAttribute('d', `M${160 - x} ${y} A135 135 0 0 1 ${160 + x} ${y}`);
}
