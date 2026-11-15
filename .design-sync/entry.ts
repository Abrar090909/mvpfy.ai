// Library entry for design-sync: the presentational component surface of mvpfy —
// components that take props and never call window.mvpfy, so they render
// outside Electron. The shell views (Sidebar, StatusBar) are here because they
// are the frame every screen sits in.
export { default as LogPanel } from '../src/components/LogPanel';
export { default as Logo } from '../src/components/Logo';
export { default as Sidebar } from '../src/views/Sidebar';
export { default as StatusBar } from '../src/views/StatusBar';
export { default as ConnectFeature1Banner } from '../src/views/ConnectFeature1Banner';
