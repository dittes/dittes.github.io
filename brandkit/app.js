// ==========================================
// UTILITIES
// ==========================================
function rgbToHex(r, g, b) {
  return "#" + (1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1).toUpperCase();
}

function generateCSSVars(data) {
  let css = `:root {\n`;
  if (data.colors) {
    Object.entries(data.colors).forEach(([role, colors]) => {
      if (Array.isArray(colors) && colors.length > 0) {
        css += `  --brand-color-${role}: ${colors[0].hex};\n`;
      }
    });
  }
  if (data.fonts) {
    ['heading', 'body', 'ui'].forEach(role => {
      if (data.fonts[role] && data.fonts[role].family) {
        css += `  --brand-font-${role}: ${data.fonts[role].family};\n`;
      }
    });
  }
  css += `}\n`;
  return css;
}

// ==========================================
// UI HANDLING
// ==========================================
function setupUI() {
  document.getElementById('export-json').addEventListener('click', () => {
    if(!window.BrandState.currentData) return;
    const blob = new Blob([JSON.stringify(window.BrandState.currentData, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'brand-tokens.json'; a.click();
  });

  document.getElementById('export-css').addEventListener('click', () => {
    if(!window.BrandState.currentData) return;
    const css = generateCSSVars(window.BrandState.currentData);
    navigator.clipboard.writeText(css).then(() => alert("Copied to clipboard!"));
  });
}

function renderResults(data) {
  document.getElementById('results-container').classList.remove('hidden');
  
  // Render Colors
  const colorsHtml = Object.entries(data.colors).map(([role, colorArr]) => {
    if (!Array.isArray(colorArr) || colorArr.length === 0) return '';
    return colorArr.slice(0, 3).map(c => `
      <div>
        <div class="swatch" style="background-color: ${c.hex};" title="${c.hex}"></div>
        <div class="swatch-role">${role}</div>
        <div class="swatch-label">${c.hex.toUpperCase()}</div>
      </div>
    `).join('');
  }).join('');
  document.querySelector('#card-colors .card-content').innerHTML = colorsHtml ? `<div class="swatch-grid">${colorsHtml}</div>` : '<p class="text-muted">No specific colors detected.</p>';

  // Render Fonts
  const fontsHtml = ['heading', 'body', 'ui'].map(role => {
    const fontObj = data.fonts[role];
    if(!fontObj || !fontObj.family) return '';
    return `
      <div class="font-item">
        <strong>${role.toUpperCase()} <span class="badge ${data.fonts.confidence.toLowerCase()}">${data.fonts.confidence}</span></strong>
        <span class="font-family">${fontObj.family}</span>
        <div class="font-preview" style="font-family: ${fontObj.family}">The quick brown fox jumps over the lazy dog.</div>
      </div>
    `;
  }).join('');
  document.querySelector('#card-fonts .card-content').innerHTML = fontsHtml || '<p>No accurate fonts detected (Requires current-page mode).</p>';

  // Render Logo
  const logosHtml = (data.logo.candidates || []).slice(0,3).map(cand => {
    return `<div style="margin-bottom: 1rem;">
      <img src="${cand.src}" style="max-height: 80px; max-width: 100%; border: 1px solid var(--border); padding: 5px; background: #eee;" />
      <div style="font-size: 0.8rem; margin-top: 5px;">Score: ${cand.score} <span class="badge ${data.logo.confidence.toLowerCase()}">${data.logo.confidence}</span></div>
    </div>`;
  }).join('');
  document.querySelector('#card-logo .card-content').innerHTML = logosHtml || '<p>No obvious logos found.</p>';

  // Render Signals
  const signalsObj = data.brandSignals || {};
  let sigHtml = `<ul class="evidence-list">`;
  if(signalsObj.themeColor) sigHtml += `<li><strong>Theme Color:</strong> <div style="display:inline-block; width:15px; height:15px; background:${signalsObj.themeColor}; vertical-align:middle; border-radius:3px; margin: 0 5px;"></div>${signalsObj.themeColor}</li>`;
  if(signalsObj.favicon) sigHtml += `<li><strong>Favicon:</strong> <img src="${signalsObj.favicon}" width="16" height="16" style="vertical-align:middle; margin:0 5px;"/> Found</li>`;
  if(signalsObj.ogImage) sigHtml += `<li><strong>OG Image:</strong> Found metadata</li>`;
  sigHtml += `</ul>`;
  document.querySelector('#card-signals .card-content').innerHTML = sigHtml;

  // Render Evidence
  let evHtml = `<ul class="evidence-list">`;
  (data.evidence || []).forEach(e => {
    evHtml += `<li><span class="evidence-source">[${e.source}]</span> ${e.message}</li>`;
  });
  (data.warnings || []).forEach(w => {
    evHtml += `<li><span style="color: var(--text-muted);">⚠️ [Warning]</span> ${w}</li>`;
  });
  evHtml += `</ul>`;
  document.querySelector('#card-evidence .card-content').innerHTML = evHtml;
}

// ==========================================
// MODE 1: BOOKMARKLET
// ==========================================
function generateBookmarklet() {
  const currentAppUrl = window.location.href.split('#')[0];
  const payloadStr = `
    (function() {
      const APP_URL = "${currentAppUrl}";
      const res = {
        mode: "current-page", page: { url: window.location.href, title: document.title },
        logo: { candidates: [], confidence: "Medium" }, fonts: { confidence: "High" },
        colors: { background: [], surface: [], text: [], accent: [], secondary: [] },
        brandSignals: {}, evidence: [], warnings: []
      };

      try {
        const colorCounts = {}; const bgCounts = {};
        const elements = document.querySelectorAll('body, header, main, div, p, a, button, [role="button"]');
        
        elements.forEach(el => {
          const style = window.getComputedStyle(el);
          const color = style.color; const bg = style.backgroundColor;
          if (color && color !== 'rgba(0, 0, 0, 0)') colorCounts[color] = (colorCounts[color] || 0) + 1;
          if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
            const weight = (el.tagName === 'BUTTON' || el.tagName === 'A') ? 10 : 1;
            bgCounts[bg] = (bgCounts[bg] || 0) + weight;
          }
        });

        const toHex = (rgbStr) => {
          const m = rgbStr.match(/\\d+/g);
          if(!m || m.length < 3) return rgbStr;
          return "#" + m.slice(0,3).map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
        };

        const sortedBgs = Object.entries(bgCounts).sort((a,b) => b[1] - a[1]);
        if(sortedBgs.length > 0) res.colors.background.push({hex: toHex(sortedBgs[0][0])});
        if(sortedBgs.length > 1) res.colors.accent.push({hex: toHex(sortedBgs[1][0])}); 

        const sortedText = Object.entries(colorCounts).sort((a,b) => b[1] - a[1]);
        if(sortedText.length > 0) res.colors.text.push({hex: toHex(sortedText[0][0])});

        res.evidence.push({ source: "DOM Analyzer", message: "Sampled computed colors from " + elements.length + " visible elements." });

        const getFont = (sel) => { const el = document.querySelector(sel); return el ? window.getComputedStyle(el).fontFamily : null; };
        res.fonts.heading = { family: getFont('h1, h2') };
        res.fonts.body = { family: getFont('p, article') };
        res.fonts.ui = { family: getFont('button, nav a') };
        res.evidence.push({ source: "DOM Analyzer", message: "Computed exact typography stacks." });

        const logos = document.querySelectorAll('img[alt*="logo" i], img[class*="logo" i], header img, svg[class*="logo" i]');
        Array.from(logos).slice(0,5).forEach(img => {
           let src = img.tagName === 'IMG' ? img.src : 'data:image/svg+xml;base64,' + btoa(new XMLSerializer().serializeToString(img));
           if(src) res.logo.candidates.push({ src: src, score: 90 });
        });
        if(res.logo.candidates.length > 0) res.logo.confidence = "High";

        const themeMeta = document.querySelector('meta[name="theme-color"]');
        if(themeMeta) res.brandSignals.themeColor = themeMeta.content;
        const favicon = document.querySelector('link[rel~="icon"]');
        if(favicon) res.brandSignals.favicon = favicon.href;

        const b64 = btoa(unescape(encodeURIComponent(JSON.stringify(res))));
        window.open(APP_URL + '#data=' + b64, '_blank');
      } catch (err) {
        alert("Brand Detector Error: " + err.message);
      }
    })();
  `;
  return `javascript:${encodeURIComponent(payloadStr.trim())}`;
}

// ==========================================
// MODE 2: URL FETCH
// ==========================================
async function analyzeUrl(targetUrl) {
  const res = {
    mode: "url", page: { url: targetUrl, title: "" },
    logo: { candidates: [], confidence: "Low" }, fonts: { confidence: "Blocked" },
    colors: { background: [], surface: [], text: [], accent: [], secondary: [] },
    brandSignals: {}, evidence: [], warnings: []
  };

  try {
    const response = await fetch(targetUrl, { method: 'GET' });
    if (!response.ok) throw new Error("HTTP " + response.status);
    
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");

    res.page.title = doc.title;
    res.evidence.push({ source: "URL Fetch", message: "Successfully fetched and parsed HTML." });

    const themeMeta = doc.querySelector('meta[name="theme-color"]');
    if (themeMeta) res.brandSignals.themeColor = themeMeta.getAttribute('content');
    const ogImage = doc.querySelector('meta[property="og:image"]');
    if (ogImage) res.brandSignals.ogImage = ogImage.getAttribute('content');

    const makeAbsolute = (src) => { try { return new URL(src, targetUrl).href; } catch(e) { return src; } };
    const favicon = doc.querySelector('link[rel~="icon"]');
    if (favicon) res.brandSignals.favicon = makeAbsolute(favicon.getAttribute('href'));

    const imgLogo = doc.querySelector('img[alt*="logo" i], header img');
    if (imgLogo) res.logo.candidates.push({ src: makeAbsolute(imgLogo.getAttribute('src')), score: 60 });
    
    if (res.brandSignals.themeColor) res.colors.accent.push({ hex: res.brandSignals.themeColor });
    res.warnings.push("Layout, specific colors, and precise fonts cannot be detected safely via pure static URL fetch. Use the Bookmarklet for deep analysis.");

  } catch (err) {
    res.evidence.push({ source: "Security / CORS", message: `Fetch blocked or failed: ${err.message}` });
    res.warnings.push("Most modern websites block cross-origin requests. Use the Bookmarklet mode to analyze this site.");
    res.logo.confidence = "Blocked"; res.fonts.confidence = "Blocked";
  }
  return res;
}

// ==========================================
// MODE 3: IMAGE ANALYSIS
// ==========================================
async function analyzeImage(file) {
  const res = {
    mode: "image", logo: { candidates: [], confidence: "Medium" }, fonts: { confidence: "Blocked" },
    colors: { background: [], surface: [], text: [], accent: [], secondary: [] },
    brandSignals: {}, evidence: [], warnings: []
  };

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        res.logo.candidates.push({ src: event.target.result, score: 100 });
        const canvas = document.getElementById('image-canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width; canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        try {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
          const colorCounts = {};

          for (let i = 0; i < imgData.length; i += 40) {
            if (imgData[i+3] < 128) continue; 
            const qR = Math.round(imgData[i] / 10) * 10;
            const qG = Math.round(imgData[i+1] / 10) * 10;
            const qB = Math.round(imgData[i+2] / 10) * 10;
            const hex = rgbToHex(qR, qG, qB);
            colorCounts[hex] = (colorCounts[hex] || 0) + 1;
          }

          const sortedColors = Object.entries(colorCounts).sort((a,b) => b[1] - a[1]);
          if(sortedColors.length > 0) res.colors.background.push({hex: sortedColors[0][0]});
          if(sortedColors.length > 1) res.colors.accent.push({hex: sortedColors[1][0]});
          if(sortedColors.length > 2) res.colors.secondary.push({hex: sortedColors[2][0]});

          res.evidence.push({ source: "Canvas Extractor", message: `Sampled ${sortedColors.length} distinct quantized colors.` });
        } catch(e) {
           res.warnings.push("Tainted canvas: Could not extract pixels. " + e.message);
        }
        resolve(res);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ==========================================
// APP INITIALIZATION
// ==========================================
window.BrandState = { currentData: null };

document.addEventListener('DOMContentLoaded', () => {
  setupUI();
  setupTabs();
  
  // 1. Setup Bookmarklet
  document.getElementById('bookmarklet-link').href = generateBookmarklet();

  // 2. Setup URL Analysis
  document.getElementById('url-analyze-btn').addEventListener('click', async () => {
    const url = document.getElementById('url-input').value;
    if(!url) return;
    const btn = document.getElementById('url-analyze-btn');
    btn.textContent = "Analyzing...";
    
    try {
      const results = await analyzeUrl(url);
      window.BrandState.currentData = results;
      renderResults(results);
    } catch(e) {
      document.getElementById('url-status').innerHTML = `<span style="color:red">Failed: ${e.message}</span>`;
    }
    btn.textContent = "Analyze";
  });

  // 3. Setup Image Analysis
  const dropzone = document.getElementById('file-dropzone');
  const fileInput = document.getElementById('file-input');
  
  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', e => { e.preventDefault(); dropzone.style.borderColor = 'var(--primary)'; });
  dropzone.addEventListener('dragleave', e => { e.preventDefault(); dropzone.style.borderColor = 'var(--border)'; });
  dropzone.addEventListener('drop', e => {
    e.preventDefault();
    dropzone.style.borderColor = 'var(--border)';
    if(e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', e => {
    if(e.target.files.length) handleFile(e.target.files[0]);
  });

  // 4. Check Bookmarklet Payload
  checkHashPayload();
  window.addEventListener('hashchange', checkHashPayload);
});

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      e.target.classList.add('active');
      document.getElementById(e.target.dataset.target).classList.add('active');
    });
  });
}

function checkHashPayload() {
  if (window.location.hash.startsWith('#data=')) {
    try {
      const base64 = window.location.hash.replace('#data=', '');
      const json = decodeURIComponent(escape(atob(base64))); 
      const results = JSON.parse(json);
      window.BrandState.currentData = results;
      renderResults(results);
      history.replaceState(null, null, ' ');
    } catch (e) {
      console.error("Failed to parse bookmarklet payload", e);
    }
  }
}

async function handleFile(file) {
  if (!file.type.startsWith('image/')) return;
  const results = await analyzeImage(file);
  window.BrandState.currentData = results;
  renderResults(results);
}