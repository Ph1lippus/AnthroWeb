import React, { useState } from 'react';

/**
 * Explains what a recovery phrase is, before anyone goes looking for one.
 *
 * Separate from the lock screen on purpose. On the lock screen this would be
 * another modal stacked on another modal while someone is locked out of their
 * own data, and the instinct in that moment is to dismiss things. Here the
 * person chose to open it, so it can afford to say why it exists and what
 * happens if it is lost.
 *
 * On `auth-card` like the other forms: this is prose plus an acknowledgement
 * plus one button, which is the same shape as login and register, and it was
 * rendering in a separate modal vocabulary with a checkbox and a button styled
 * differently from every other control in the app.
 */
interface RecoveryPhraseDialogProps {
    onClose: () => void;
}

const RecoveryPhraseDialog: React.FC<RecoveryPhraseDialogProps> = ({ onClose }) => {
    const [acknowledged, setAcknowledged] = useState(false);

    return (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="vault-recovery-title">
            <div className="auth-card auth-card-narrow text-start">
                <h2 id="vault-recovery-title" className="auth-title text-center">
                    About your recovery phrase
                </h2>

                <p className="auth-text auth-text-muted">
                    When you turned on encryption, you were shown 24 words. Those words
                    are the only way to open your data without the PIN.
                </p>
                <p className="auth-text auth-text-muted">
                    Your data is encrypted on this device before it is sent, and the key
                    that opens it comes from your PIN. Nobody else holds it — not this
                    app, not the database, not whoever runs the server. That is the
                    point, and it also means that losing both the PIN and the phrase
                    loses the data for good.
                </p>
                <p className="auth-text auth-text-muted mb-3">
                    If you wrote it down, enter it on the lock screen under
                    &ldquo;Forgot your PIN?&rdquo; The words are not case-sensitive;
                    the order matters.
                </p>

                <label className="auth-checkbox">
                    <input
                        type="checkbox"
                        checked={acknowledged}
                        onChange={e => setAcknowledged(e.target.checked)}
                    />
                    <span>I have my recovery phrase somewhere other than this device</span>
                </label>

                <button
                    type="button"
                    className="btn-primary w-100"
                    disabled={!acknowledged}
                    onClick={onClose}
                >
                    Enter recovery phrase
                </button>
            </div>
        </div>
    );
};

export default RecoveryPhraseDialog;