import React, { useState } from 'react';
import { KeyRound } from 'lucide-react';

/**
 * Explains what a recovery phrase is, before anyone goes looking for one.
 *
 * Separate from the lock screen on purpose. On the lock screen this would be
 * another modal stacked on another modal while someone is locked out of their
 * own data, and the instinct in that moment is to dismiss things. Here the
 * person chose to open it, so it can afford to say why it exists and what
 * happens if it is lost.
 */
interface RecoveryPhraseDialogProps {
    onClose: () => void;
}

const RecoveryPhraseDialog: React.FC<RecoveryPhraseDialogProps> = ({ onClose }) => {
    const [acknowledged, setAcknowledged] = useState(false);

    return (
        <div className="vault-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="vault-recovery-title">
            <div className="vault-modal">
                <div className="vault-lock-icon" aria-hidden="true">
                    <KeyRound size={26} />
                </div>
                <h2 id="vault-recovery-title" className="vault-lock-title">About your recovery phrase</h2>

                <p>
                    When you turned on encryption, you were shown a list of 24 words.
                    Those words are the only way to open your data without the PIN.
                </p>
                <p>
                    Your data is encrypted on this device before it is sent, and the key
                    that opens it is derived from your PIN. Nobody else holds it --
                    not this app, not the database, not whoever runs the server. That is
                    the point, and it also means that if you lose both the PIN and the
                    phrase, the data cannot be recovered by anyone.
                </p>
                <p className="vault-lock-hint">
                    If you wrote the phrase down, enter it on the lock screen under
                    &ldquo;Forgot your PIN?&rdquo; The words are not case-sensitive and
                    the order matters.
                </p>

                <label className="vault-modal-check">
                    <input
                        type="checkbox"
                        checked={acknowledged}
                        onChange={e => setAcknowledged(e.target.checked)}
                    />
                    <span>I have my recovery phrase somewhere other than this device</span>
                </label>

                <button
                    type="button"
                    className="btn-action vault-lock-primary"
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