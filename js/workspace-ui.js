/** Local, dependency-free visual system for the engineering workspace. */
const WorkspaceUI = (() => {
  const paths = {
    home: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    sizing: '<path d="m13 2-9 12h7l-1 8 10-13h-7z"/>',
    database: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
    wirecalc: '<path d="M8 3v5m8-5v5M6 8h12v4a6 6 0 0 1-12 0zM12 18v3"/>',
    cableschedule: '<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>',
    hybrid: '<rect x="3" y="6" width="17" height="12" rx="2"/><path d="M22 10v4M8 12h6M11 9v6"/>',
    utilityvalidator: '<path d="M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6zM8 12l3 3 5-6"/>',
    yield: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5M17.5 17.5 19 19M5 19l1.5-1.5M17.5 6.5 19 5"/>',
    financials: '<path d="M3 3v18h18M7 16l4-5 4 2 6-8M17 5h4v4"/>',
    rooflayout: '<path d="m3 10 9-7 9 7M5 9v12h14V9M9 14h6v7"/>',
    systemdesigner: '<path d="m12 2 10 6-10 6L2 8zM2 12l10 6 10-6M2 16l10 6 10-6"/>',
    inspector: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 3v18M14 13h3m-3 4h3"/>',
    moduleinventory: '<path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M7 9v6m3-6v6m2-6v6m3-6v6m2-6v6"/>',
    shading: '<path d="M12 3a9 9 0 1 0 0 18zM16 4l-1 2m5 2-2 1m3 5h-2m0 5-2-1"/>',
    checklist: '<rect x="5" y="4" width="14" height="17" rx="2"/><rect x="9" y="2" width="6" height="4" rx="1"/><path d="m9 13 2 2 4-4"/>',
    fieldtest: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
    temp: '<path d="M9 14V5a3 3 0 0 1 6 0v9a5 5 0 1 1-6 0M12 8v9m6-10h3m-3 4h2"/>',
    fault: '<path d="m12 3 10 18H2zM12 9v5m0 3h.01"/>',
    pr: '<path d="M4 18a10 10 0 1 1 16 0M12 12l5-5M8 20h8"/><circle cx="12" cy="12" r="1"/>',
    diagnostics: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M6 10h2l2-3 2 6 2-3"/>',
    inverter: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 6h6M8 15c3-6 5 6 8 0M9 10h.01"/>',
    degradation: '<path d="M3 3v18h18M6 7l5 4 4-1 6 7M17 17h4v-4"/>',
    faultai: '<path d="m12 3 3 6 6 3-6 3-3 6-3-6-6-3 6-3z"/>',
    standards: '<path d="M12 5c-3-3-8-2-10-1v15c3-1 7-2 10 1 3-3 7-2 10-1V4c-2-1-7-2-10 1zM12 5v15"/>',
    reportbuilder: '<path d="M14 2H5v20h14V7zM14 2v5h5M8 11h8M8 15h8M8 18h5"/>',
    settings: '<path d="m9 3-1 3-3 1-2 3 2 2-1 3 3 2 3-1 2 3 3-1 1-3 3-1 2-3-2-2 1-3-3-2-3 1-2-3z"/><circle cx="12" cy="11" r="3"/>',
    search: '<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
    folder: '<path d="M3 7V4h6l2 3h10v13H3z"/>',
    cloud: '<path d="M6 18a5 5 0 1 1 1-10 7 7 0 0 1 13 3 4 4 0 0 1-1 7M9 15l3-3 3 3M12 12v9"/>',
  };
  paths.inspection = paths.checklist;
  paths.fieldanalysis = paths.financials;
  paths.basiccalc = paths.sizing;
  function icon(name, cls = '') {
    return `<svg class="ui-icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.systemdesigner}</svg>`;
  }
  function solarScene() {
    const panels = Array.from({length: 6}, (_, i) => {
      const x = 58 + (i % 3) * 82, y = 82 + Math.floor(i / 3) * 68;
      return `<g transform="translate(${x} ${y})"><path d="M2 59v19m69-19v19" stroke="#486772" stroke-width="3"/><rect width="74" height="59" rx="3" fill="#1c4b5f" stroke="#92bdc8" stroke-width="1.4"/><path d="M18 1v57m19-57v57m18-57v57M1 20h72M1 39h72" stroke="#5d899b" stroke-width=".8"/><path d="M3 3h68" stroke="#c5e3e8" opacity=".5"/></g>`;
    }).join('');
    return `<svg viewBox="0 0 380 285" class="solar-scene" aria-hidden="true"><defs><pattern id="scene-grid" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0v25" fill="none" stroke="#5c7a83" stroke-opacity=".15"/></pattern><radialGradient id="sun-glow"><stop stop-color="#f7b84e" stop-opacity=".25"/><stop offset="1" stop-color="#f7b84e" stop-opacity="0"/></radialGradient></defs><rect width="380" height="285" fill="url(#scene-grid)"/><circle cx="293" cy="56" r="78" fill="url(#sun-glow)"/><circle cx="293" cy="56" r="20" fill="#f7b84e"/><g stroke="#f7b84e" stroke-width="1.5" opacity=".6"><path d="M293 23v-7m0 80v-7M260 56h-7m80 0h-7M269 32l-5-5m58 58-5-5m-48 0-5 5m58-58-5 5"/></g><g transform="translate(17 13) skewX(-18) scale(1 .88)">${panels}</g><path d="M32 236h270" stroke="#698c94" stroke-dasharray="3 5"/><path d="M32 232v8m270-8v8" stroke="#698c94"/><text x="110" y="259" font-size="9" font-family="monospace" letter-spacing="2" fill="#94b3bb">DESIGN. VALIDATE. DELIVER.</text></svg>`;
  }
  function polishForms(container, page) {
    container.querySelectorAll('.form-group').forEach(group => {
      const labels = group.querySelectorAll('label');
      const controls = group.querySelectorAll('input:not([type="hidden"]),select,textarea');
      if (labels.length === 1 && controls.length === 1 && controls[0].id && !labels[0].htmlFor) labels[0].htmlFor = controls[0].id;
      controls.forEach(control => {
        if (control.placeholder && !control.labels?.length && !control.hasAttribute('aria-label')) control.setAttribute('aria-label', control.placeholder);
        const hint = group.querySelector('.form-hint');
        if (hint && control.id && !control.hasAttribute('aria-describedby')) {
          if (!hint.id) hint.id = `${control.id}-hint`;
          control.setAttribute('aria-describedby', hint.id);
        }
      });
    });
    const heading = container.querySelector('.page-title');
    if (heading) { heading.setAttribute('role', 'heading'); heading.setAttribute('aria-level', '1'); }
    if (heading && !heading.querySelector('svg')) {
      // Strip the decorative leading emoji, preserving the module's actual title.
      const text = heading.textContent.replace(/^[\s\p{Extended_Pictographic}\uFE0F\u2705\u26A0]+/u, '');
      heading.textContent = text;
      heading.insertAdjacentHTML('afterbegin', icon(page));
    }
    container.querySelectorAll('table').forEach(table => {
      const parent = table.parentElement;
      if (parent.classList.contains('table-scroll') || parent.style.overflowX === 'auto' || parent.style.overflow === 'auto') return;
      const wrapper = document.createElement('div');
      wrapper.className = 'table-scroll';
      wrapper.tabIndex = 0;
      wrapper.setAttribute('role', 'region');
      wrapper.setAttribute('aria-label', 'Scrollable results table');
      table.before(wrapper);
      wrapper.appendChild(table);
    });
  }
  return { icon, solarScene, polishForms };
})();
