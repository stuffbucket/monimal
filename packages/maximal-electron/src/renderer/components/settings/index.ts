/**
 * The settings surfaces.
 *
 * Ported from the parked Tauri shell by function. Each one takes its content
 * as props, because the shell owns the surface and the consumer owns what is
 * on it.
 *
 * Where each lives is a decision, stated in the file that makes it. The
 * catalogue, the report and the dashboard are tabs: wide, read rather than
 * operated, and worth leaving open. The keys and the toggles are dialogs:
 * bounded tasks, and in the keys' case a secret that should leave the screen
 * when the task is done.
 */

export { ApiKeysDialog } from './ApiKeysDialog.js';
export { AppTogglesDialog } from './AppTogglesDialog.js';
export { CopyButton, copyText } from './CopyButton.js';
export { Diagnostics } from './Diagnostics.js';
export { ModelCards } from './ModelCards.js';
export { SettingsPage, SettingsSection } from './SettingsPage.js';
export { Usage } from './Usage.js';
