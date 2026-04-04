let blurMode = false;
let isDrawing = false;
let startX = 0, startY = 0;
let selectionEl = null;
let injectedStyle = null;
let modeIndicator = null;
const overlays = []; // { el, docX, docY, w, h }
let scrollListenerActive = false;

// --- Toggle ---

function enableBlurMode() {
  blurMode = true;

  injectedStyle = document.createElement("style");
  injectedStyle.textContent = `
    * { cursor: crosshair !important; user-select: none !important; }
    .blur-anything-overlay:hover::after {
      content: '✕';
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      color: rgba(255,255,255,0.9);
      background: rgba(0,0,0,0.18);
      text-shadow: 0 1px 3px rgba(0,0,0,0.5);
    }
  `;
  document.head.appendChild(injectedStyle);

  // Thin border signals blur mode is active
  modeIndicator = document.createElement("div");
  Object.assign(modeIndicator.style, {
    position: "fixed",
    inset: "0",
    border: "2px solid rgba(99,102,241,0.75)",
    pointerEvents: "none",
    zIndex: "2147483645",
    boxSizing: "border-box",
  });
  document.body.appendChild(modeIndicator);

  document.addEventListener("mousedown", onMouseDown, true);
  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("mouseup", onMouseUp, true);
  document.addEventListener("keydown", onKeyDown, true);
}

function disableBlurMode() {
  blurMode = false;

  injectedStyle?.remove();  injectedStyle = null;
  modeIndicator?.remove(); modeIndicator = null;
  selectionEl?.remove();   selectionEl = null;
  isDrawing = false;

  document.removeEventListener("mousedown", onMouseDown, true);
  document.removeEventListener("mousemove", onMouseMove, true);
  document.removeEventListener("mouseup", onMouseUp, true);
  document.removeEventListener("keydown", onKeyDown, true);
}

// --- Scroll: reposition all overlays to stay locked to content ---

function onScroll() {
  for (const { el, docX, docY } of overlays) {
    el.style.left = docX - window.scrollX + "px";
    el.style.top  = docY - window.scrollY + "px";
  }
}

// --- Keyboard ---

function onKeyDown(e) {
  if (e.key !== "Escape") return;
  if (isDrawing) {
    // Cancel in-progress selection without creating a blur
    isDrawing = false;
    selectionEl?.remove();
    selectionEl = null;
  } else {
    disableBlurMode();
  }
  e.preventDefault();
  e.stopPropagation();
}

// --- Mouse handlers ---

function onMouseDown(e) {
  if (e.button !== 0) return; // left-click only

  if (e.target.classList.contains("blur-anything-overlay")) {
    removeOverlay(e.target);
    e.preventDefault();
    e.stopPropagation();
    return;
  }

  isDrawing = true;
  startX = e.clientX;
  startY = e.clientY;

  selectionEl = document.createElement("div");
  Object.assign(selectionEl.style, {
    position: "fixed",
    border: "2px dashed rgba(255,255,255,0.9)",
    outline: "1px solid rgba(0,0,0,0.4)",
    background: "rgba(255,255,255,0.08)",
    pointerEvents: "none",
    zIndex: "2147483646",
    left: startX + "px",
    top: startY + "px",
    width: "0",
    height: "0",
  });
  document.body.appendChild(selectionEl);

  e.preventDefault();
  e.stopPropagation();
}

function onMouseMove(e) {
  if (!isDrawing || !selectionEl) return;

  const x = Math.min(e.clientX, startX);
  const y = Math.min(e.clientY, startY);
  const w = Math.abs(e.clientX - startX);
  const h = Math.abs(e.clientY - startY);

  Object.assign(selectionEl.style, {
    left: x + "px",
    top: y + "px",
    width: w + "px",
    height: h + "px",
  });

  e.preventDefault();
  e.stopPropagation();
}

function onMouseUp(e) {
  if (!isDrawing || e.button !== 0) return;
  isDrawing = false;

  if (!selectionEl) return;

  const rect = selectionEl.getBoundingClientRect();
  selectionEl.remove();
  selectionEl = null;

  if (rect.width > 5 && rect.height > 5) {
    createBlurOverlay(rect.left, rect.top, rect.width, rect.height);
  }

  e.preventDefault();
  e.stopPropagation();
}

// --- Blur overlay ---

function createBlurOverlay(viewX, viewY, w, h) {
  const docX = viewX + window.scrollX;
  const docY = viewY + window.scrollY;

  const el = document.createElement("div");
  el.className = "blur-anything-overlay";
  Object.assign(el.style, {
    position: "fixed",
    left: viewX + "px",
    top: viewY + "px",
    width: w + "px",
    height: h + "px",
    backdropFilter: "blur(16px)",
    webkitBackdropFilter: "blur(16px)",
    zIndex: "2147483647",
    cursor: "pointer",
    contain: "paint",
    boxSizing: "border-box",
    border: "1px solid rgba(255,255,255,0.15)",
  });
  // Always removable, regardless of whether blur mode is on
  el.addEventListener("click", () => removeOverlay(el));

  document.body.appendChild(el);
  overlays.push({ el, docX, docY, w, h });

  // Attach scroll listener once, keep it alive as long as overlays exist
  if (!scrollListenerActive) {
    window.addEventListener("scroll", onScroll, { passive: true });
    scrollListenerActive = true;
  }
}

function removeOverlay(el) {
  const idx = overlays.findIndex(o => o.el === el);
  if (idx !== -1) overlays.splice(idx, 1);
  el.remove();

  // No overlays left and blur mode is off — scroll listener no longer needed
  if (overlays.length === 0 && !blurMode) {
    window.removeEventListener("scroll", onScroll);
    scrollListenerActive = false;
  }
}

// --- Message listener ---

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.action === "toggle") {
    blurMode ? disableBlurMode() : enableBlurMode();
  }
});
