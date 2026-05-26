'use strict';

let currentTab = null;
let currentBlurMode = false;

document.addEventListener('DOMContentLoaded', init);

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  currentTab = tab;

  // Wire up all listeners up front
  document.getElementById('toggleBtn').addEventListener('click', onToggle);
  document.getElementById('clearAllBtn').addEventListener('click', onClearAll);
  document.getElementById('onboardingCta').addEventListener('click', onOnboardingCta);

  const { hasSeenOnboarding } = await chrome.storage.local.get('hasSeenOnboarding');
  if (!hasSeenOnboarding) {
    document.getElementById('onboarding').classList.remove('hidden');
    return; // Tab state loaded after CTA is clicked
  }

  await refreshState();
}

// ── State ────────────────────────────────────────────────────────────────────

async function refreshState() {
  if (isRestricted(currentTab?.url)) {
    setDisabled("Can't blur this page");
    return;
  }
  try {
    const state = await chrome.tabs.sendMessage(currentTab.id, { action: 'getState' });
    updateUI(state.blurMode, state.count);
  } catch {
    // Content script not yet loaded on this tab — treat as fresh (inactive, 0 blurs)
    updateUI(false, 0);
  }
}

function updateUI(blurActive, count) {
  currentBlurMode = blurActive;

  const btn = document.getElementById('toggleBtn');
  btn.textContent = blurActive ? 'Deactivate' : 'Activate';
  btn.classList.toggle('is-active', blurActive);
  btn.disabled = false;

  updateCount(count);
}

function updateCount(count) {
  const el = document.getElementById('blurCount');
  if (count === 0) {
    el.textContent = 'No active blurs';
    el.classList.add('zero');
  } else {
    el.textContent = `${count} blur${count !== 1 ? 's' : ''} on this page`;
    el.classList.remove('zero');
  }
  document.getElementById('clearAllBtn').classList.toggle('hidden', count === 0);
}

function setDisabled(label) {
  const btn = document.getElementById('toggleBtn');
  btn.textContent = label;
  btn.disabled = true;
  btn.classList.remove('is-active');
  document.getElementById('footer').classList.add('hidden');
  document.getElementById('escHint').classList.add('hidden');
}

// ── Handlers ─────────────────────────────────────────────────────────────────

async function onToggle() {
  if (!currentTab || isRestricted(currentTab.url)) return;
  const wasActive = currentBlurMode;
  try {
    await sendToTab('toggle');
    if (!wasActive) {
      // Activating — close popup so the user can interact with the page
      window.close();
    } else {
      await refreshState();
    }
  } catch {
    setDisabled("Can't blur this page");
  }
}

async function onClearAll() {
  if (!currentTab) return;
  try {
    await chrome.tabs.sendMessage(currentTab.id, { action: 'clearAll' });
    updateCount(0);
  } catch { /* tab may have been closed */ }
}

async function onOnboardingCta() {
  await chrome.storage.local.set({ hasSeenOnboarding: true });
  document.getElementById('onboarding').classList.add('hidden');

  if (isRestricted(currentTab?.url)) {
    // Can't activate on this page — show disabled state instead
    await refreshState();
    return;
  }

  try {
    await sendToTab('toggle');
    window.close();
  } catch {
    await refreshState();
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isRestricted(url) {
  if (!url) return true;
  return /^(chrome|chrome-extension|about|edge|brave):\/\//.test(url);
}

async function sendToTab(action) {
  try {
    return await chrome.tabs.sendMessage(currentTab.id, { action });
  } catch {
    // Content script not loaded yet — inject it first, then retry
    await chrome.scripting.executeScript({
      target: { tabId: currentTab.id },
      files: ['content.js'],
    });
    return await chrome.tabs.sendMessage(currentTab.id, { action });
  }
}
