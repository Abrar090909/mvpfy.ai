import { app, shell, WebContents } from 'electron';
import { isSamePage, isWebUrl } from './urls';

/**
 * What the window and the embedded panes may do with a URL.
 *
 * The renderer, and the apps previewed inside <webview>s, both handle content
 * mvpfy did not write: a repo's own frontend, a page it links to, an agent's
 * output. Handing any of that to the OS by URL scheme (`file:`, `ms-*:`,
 * custom protocol handlers) or letting it replace the app's own page is how a
 * hostile link becomes code running on the user's machine, so only plain web
 * URLs leave the app and the app's own page never navigates away.
 */

/** Open a link in the user's browser, if it is a web link at all. */
function openOutside(url: string): void {
  if (isWebUrl(url)) void shell.openExternal(url);
}

function hardenWindow(contents: WebContents): void {
  contents.setWindowOpenHandler(({ url }) => {
    openOutside(url);
    return { action: 'deny' };
  });
  // The app is a single page that never navigates itself; anything that tries
  // to replace it (a dropped file, a stray link) goes to the browser instead.
  contents.on('will-navigate', (event, url) => {
    if (isSamePage(contents.getURL(), url)) return;
    event.preventDefault();
    openOutside(url);
  });
  // Previews and the editor are <webview>s, which are a second renderer with
  // their own preferences. Whatever the page asked for, they get no preload,
  // no Node, a sandbox, and only a web URL to start from.
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.nodeIntegrationInSubFrames = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    if (!isWebUrl(params.src)) event.preventDefault();
  });
}

function hardenWebview(contents: WebContents): void {
  // A previewed app may navigate anywhere on the web (an OAuth redirect, its
  // own deployed API), but not to a local file or an OS protocol handler.
  contents.on('will-navigate', (event, url) => {
    if (!isWebUrl(url)) event.preventDefault();
  });
  contents.on('will-redirect', (event, url) => {
    if (!isWebUrl(url)) event.preventDefault();
  });
}

/** Installs the rules on every window and webview as it is created. */
export function installNavigationGuards(): void {
  app.on('web-contents-created', (_event, contents) => {
    const type = contents.getType();
    if (type === 'webview') hardenWebview(contents);
    else if (type === 'window') hardenWindow(contents);
  });
}
