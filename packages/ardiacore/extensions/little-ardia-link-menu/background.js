const MENU_ID = "open-link-in-little-ardia";

function ensureMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU_ID, title: "Open Link in Little Ardia", contexts: ["link"] }, () => void chrome.runtime.lastError);
  });
}

chrome.runtime.onInstalled.addListener(ensureMenu);
chrome.runtime.onStartup.addListener(ensureMenu);
ensureMenu();

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== MENU_ID || !info.linkUrl) return;
  const url = `${chrome.runtime.getURL("open.html")}#${encodeURIComponent(info.linkUrl)}`;
  chrome.tabs.create({ url, active: false, ...(tab && tab.windowId >= 0 ? { windowId: tab.windowId } : {}) });
});
