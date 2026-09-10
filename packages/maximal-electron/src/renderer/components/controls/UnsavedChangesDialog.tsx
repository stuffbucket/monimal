import { Button } from './Button.js';
import { Dialog } from './Overlays.js';

/** Confirm whether pending form edits should be saved before navigation. */
export function UnsavedChangesDialog({
  open,
  saving = false,
  saveDisabled = false,
  onSave,
  onDiscard,
  onCancel,
}: {
  open: boolean;
  saving?: boolean;
  saveDisabled?: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !saving) onCancel();
      }}
      title="Save changes before leaving?"
      description="Choose whether to save or discard your changes before leaving this page."
      className="dialog unsaved-changes-dialog"
      testId="unsaved-changes-dialog"
      onEscapeKeyDown={(event) => {
        if (saving) event.preventDefault();
      }}
      onPointerDownOutside={(event) => {
        if (saving) event.preventDefault();
      }}
    >
      <h2 className="unsaved-changes-dialog__heading">Save changes before leaving?</h2>
      <p className="unsaved-changes-dialog__description">
        You have unsaved changes. Save them now, or discard them and continue.
      </p>
      <div className="unsaved-changes-dialog__actions">
        <Button onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button variant="danger" onClick={onDiscard} disabled={saving}>Discard changes</Button>
        <Button variant="primary" onClick={onSave} disabled={saving || saveDisabled}>
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
    </Dialog>
  );
}