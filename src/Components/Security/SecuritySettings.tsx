import React, { useRef, useState } from 'react';
import { useNotice } from '../Feedback/useNotice';
import { ShieldAlert, Copy, Check, TriangleAlert } from 'lucide-react';
import { enableVault, changePin, changePinWithAccountPassword, disableVault, lock } from '../../hooks/useAppLock';
import { MIN_PIN_LENGTH } from '../../services/vault/keyring';
import { sealAllExistingRows } from '../../services/vault/seal';
import type { SealProgress } from '../../services/vault/seal';

/**
 * Settings -> Security. Where the vault is turned on, changed, and turned off.
 *
 * Turning encryption on is three steps and each one exists because skipping it
 * loses something:
 *
 *  1. Choose a PIN. Six digits minimum -- four is not a secret, it is a
 *     suggestion.
 *  2. A recovery phrase, shown exactly once. This is the only copy of the key
 *     that is not derived from the PIN, so a forgotten PIN is an inconvenience
 *     rather than the end of a journal.
 *  3. Sealing what is already there. Rows written before the vault existed are
 *     plaintext until this runs; enabling without it would leave the vault armed
 *     and the old data readable, which is worse than not having turned it on,
 *     because the UI would be claiming the opposite.
 */

type Stage = 'off' | 'choosing' | 'confirming' | 'phrase' | 'sealing' | 'on' | 'changing';

const SecuritySettings: React.FC = () => {
    const [stage, setStage] = useState<Stage>('off');
    const [pin, setPin] = useState('');
    const [confirmPin, setConfirmPin] = useState('');
    const [phrase, setPhrase] = useState('');
    const [busy, setBusy] = useState(false);
    const [copied, setCopied] = useState(false);
    const [progress, setProgress] = useState<SealProgress | null>(null);

    // PIN-change flow. Kept apart from the account-recovery section below,
    // which has its own password field for a different purpose: that one
    // *establishes* a recovery wrap, this one *proves* an identity in order to
    // re-wrap the master key. Sharing a field would let a value typed in one
    // appear in the other.
    const [currentPin, setCurrentPin] = useState('');
    const [changePassword, setChangePassword] = useState('');
    const [usePassword, setUsePassword] = useState(false);
    const [pinAttempts, setPinAttempts] = useState(0);

    /**
     * Errors go to the notice stack at the top of the screen, not to a block
     * inside this page.
     *
     * This is the page where it matters most. An error here is a failed PIN
     * change or a failed encryption enable -- the two things a person is most
     * likely to be staring at, waiting to find out whether it worked. Inline, it
     * renders below a button that has just been pressed, where it is easy to miss
     * and easy to scroll past.
     */
    const { notify, dismiss } = useNotice();
    const noticeId = useRef<number | null>(null);

    /**
     * Raise an error, remembering its id.
     *
     * Withdrawing on the next stage change matters because this page walks through
     * stages -- set PIN, show the recovery phrase, seal, done. A failure on one
     * stage is answered by moving to the next, and a message left on screen from a
     * stage the user has already left describes something they are no longer doing.
     */
    const raiseError = (message: string) => {
        // Withdraw the previous one first. Two errors stacked at the top of the
        // screen puts the newest below the older, and the newest is the one the
        // user just caused.
        clearError();
        noticeId.current = notify('error', message);
    };

    /** Withdraw our own message when the form is reset or the stage changes. */
    const clearError = () => {
        if (noticeId.current !== null) { dismiss(noticeId.current); noticeId.current = null; }
    };

    const reset = () => {
        setPin(''); setConfirmPin(''); setCurrentPin(''); setChangePassword('');
        setUsePassword(false); setPinAttempts(0);
        clearError(); setPhrase(''); setProgress(null); setCopied(false);
    };

    const runEnable = async () => {
        setBusy(true);
        clearError();
        try {
            const result = await enableVault(pin);
            if (!result.ok || !result.recoveryPhrase) {
                raiseError(result.error ?? 'Could not turn on encryption.');
                return;
            }
            // The vault is armed but nothing is sealed yet. Show the phrase
            // first -- if they close the tab here, the key exists only in memory
            // and the phrase would be lost, so it has to be seen before the
            // sealing walk can start.
            setPhrase(result.recoveryPhrase);
            setStage('phrase');
        } finally {
            setBusy(false);
        }
    };

    const runSeal = async () => {
        setStage('sealing');
        setBusy(true);
        try {
            const done = await sealAllExistingRows(setProgress);
            if (done.remaining > 0) {
                // Said plainly, because the alternative is a progress bar that
                // reaches 100% and a user who believes everything is encrypted
                // when some of it is not.
                raiseError(
                    `${done.remaining} row(s) are still not encrypted. ` +
                    `Run this again in a moment -- it skips what is already done.`,
                );
            }
            setStage('on');
        } catch (err) {
            raiseError(err instanceof Error ? err.message : 'Could not seal your existing data.');
            setStage('phrase');
        } finally {
            setBusy(false);
        }
    };

    /**
     * Change the PIN, proving the current one first.
     *
     * A wrong current PIN counts against the same server-side ladder the lock
     * screen uses, and once those attempts are spent the form switches to the
     * account password rather than letting someone keep guessing here.
     */
    const runChangePin = async () => {
        setBusy(true);
        clearError();
        try {
            const result = await changePin(currentPin, pin);
            if (result.ok) {
                setStage('on');
                reset();
                return;
            }
            setPinAttempts(result.attempts ?? 0);
            // Once the PIN attempts are spent, stop offering them. Leaving the
            // field up invites more guesses against a counter that is already
            // refusing them.
            if (result.exhausted) setUsePassword(true);
            raiseError(result.error ?? 'Could not change the PIN.');
        } finally {
            setBusy(false);
        }
    };

    /**
     * Change the PIN by proving the account password instead.
     *
     * A wrong password ends the session, which the service does before this
     * promise settles. Nothing to undo here beyond not claiming otherwise: the
     * screen is being torn down by the sign-out anyway.
     */
    const runChangePinWithPassword = async () => {
        setBusy(true);
        clearError();
        try {
            const result = await changePinWithAccountPassword(changePassword, pin);
            if (result.ok) {
                setStage('on');
                reset();
                return;
            }
            raiseError(result.error ?? 'Could not change the PIN.');
        } finally {
            setBusy(false);
        }
    };

    const runDisable = async () => {
        if (!confirm('Turning encryption off writes your notes and journal back to the database in plain text. Continue?')) return;
        setBusy(true);
        clearError();
        try {
            const result = await disableVault();
            if (!result.ok) { raiseError(result.error ?? 'Could not turn encryption off.'); return; }
            setStage('off');
            reset();
        } finally {
            setBusy(false);
        }
    };

    const copyPhrase = async () => {
        try {
            await navigator.clipboard.writeText(phrase);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch {
            raiseError('Could not copy. Write the words down by hand instead.');
        }
    };

    return (
        <div className="vault-settings">
            <section className="vault-settings-section">
                <h2 className="vault-settings-heading">App lock</h2>
                <p className="vault-settings-blurb">
                    A PIN that locks the whole app on launch, and again after five minutes
                    idle or when you switch away. Nothing private is rendered until it is
                    entered, and the on-device copy of your data is cleared when you lock.
                </p>

                {stage === 'off' && (
                    <button type="button" className="btn-primary" onClick={() => { reset(); setStage('choosing'); }}>
                        Turn on encryption
                    </button>
                )}

                {stage === 'choosing' && (
                    <div className="vault-setup">
                        <label className="form-label" htmlFor="vault-new-pin">Choose a PIN</label>
                        <input
                            id="vault-new-pin"
                            type="password"
                            className="form-control"
                            value={pin}
                            onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                            autoComplete="new-password"
                            inputMode="numeric"
                        />
                        <p className="vault-lock-hint">
                            At least {MIN_PIN_LENGTH} characters. A longer passphrase is
                            much stronger than six digits -- a PIN guards against someone
                            picking up your device, not against someone who already has
                            a copy of your database.
                        </p>

                        <label className="form-label" htmlFor="vault-confirm-pin">Type it again</label>
                        <input
                            id="vault-confirm-pin"
                            type="password"
                            className="form-control"
                            value={confirmPin}
                            onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                            autoComplete="new-password"
                            inputMode="numeric"
                        />
                        {confirmPin && pin !== confirmPin && (
                            <p className="t-error-msg" role="alert">Those do not match.</p>
                        )}

                        <div className="vault-setup-actions">
                            <button
                                type="button"
                                className="btn-primary"
                                disabled={busy || pin.length < MIN_PIN_LENGTH || pin !== confirmPin}
                                onClick={() => void runEnable()}
                            >
                                {busy ? 'Setting up...' : 'Continue'}
                            </button>
                            <button type="button" className="btn-link" onClick={() => { reset(); setStage('off'); }}>
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                {stage === 'phrase' && (
                    <div className="vault-setup">
                        <div className="vault-warning">
                            <TriangleAlert size={18} aria-hidden="true" />
                            <div>
                                <strong>Write these {phrase.split(' ').length} words down now.</strong>
                                <p className="vault-lock-hint">
                                    This is the only way back into your data if you forget the PIN.
                                    It is shown once and never again -- nobody, including the
                                    app, can show it to you a second time. Keep it somewhere
                                    that is not this device.
                                </p>
                            </div>
                        </div>

                        <ol className="vault-phrase">
                            {phrase.split(' ').map((word, i) => <li key={i}>{word}</li>)}
                        </ol>

                        <div className="vault-setup-actions">
                            <button type="button" className="btn-action" onClick={() => void copyPhrase()}>
                                {copied ? <Check size={15} /> : <Copy size={15} />}
                                {copied ? 'Copied' : 'Copy'}
                            </button>
                            <button type="button" className="btn-primary" onClick={() => void runSeal()}>
                                I have written them down
                            </button>
                        </div>
                    </div>
                )}

                {stage === 'sealing' && (
                    <div className="vault-setup" aria-live="polite">
                        <h3 className="vault-settings-subheading">Encrypting what is already there</h3>
                        <p className="vault-lock-hint">
                            This reads your existing notes and journal, encrypts them, and
                            writes back only ciphertext. Do not close the app until it
                            finishes -- closing now leaves some rows unencrypted.
                        </p>
                        {progress && (
                            <ul className="vault-seal-progress">
                                <li>{progress.table}: {progress.done} of {progress.total}</li>
                            </ul>
                        )}
                        <div className="vault-progress-bar">
                            <div className="vault-progress-fill" style={{ width: `${progress?.percent ?? 0}%` }} />
                        </div>
                    </div>
                )}

                {stage === 'on' && (
                    <div className="vault-setup">
                        <p className="vault-lock-confirm">
                            <ShieldAlert size={16} aria-hidden="true" />
                            Encryption is on. Your notes, journal and settings are sealed
                            before they reach the database.
                        </p>
                        <div className="vault-setup-actions">
                            <button type="button" className="btn-action" onClick={() => { reset(); setStage('changing'); }}>
                                Change PIN
                            </button>
                            <button type="button" className="btn-action" onClick={lock}>
                                Lock now
                            </button>
                            <button type="button" className="btn-action vault-lock-danger" onClick={() => void runDisable()} disabled={busy}>
                                Turn off
                            </button>
                        </div>
                    </div>
                )}

                {stage === 'changing' && (
                    <div className="vault-setup">
                        {/*
                            Two routes, in order. The current PIN first, because
                            that is what proves the person at this keyboard is the
                            owner. The account password only appears once those
                            attempts are spent, and failing it ends the session --
                            which is the whole point, because a session at an
                            unlocked device is exactly what an attacker has, and
                            ending it puts the account password in front of them.
                        */}
                        {usePassword ? (
                            <>
                                <p className="t-error-msg" role="alert">
                                    Too many wrong PINs. Enter your account password
                                    to confirm it is you.
                                </p>
                                <label className="form-label" htmlFor="vault-account-password">
                                    Account password
                                </label>
                                <input
                                    id="vault-account-password"
                                    type="password"
                                    className="form-control"
                                    value={changePassword}
                                    onChange={e => { setChangePassword(e.target.value); clearError(); }}
                                    autoComplete="current-password"
                                    onKeyDown={e => { if (e.key === 'Enter') void runChangePinWithPassword(); }}
                                />
                                <p className="vault-lock-hint">
                                    If this is not right, you will be signed out and
                                    will need your password to sign back in.
                                </p>
                                <div className="vault-setup-actions">
                                    <button
                                        type="button"
                                        className="btn-primary"
                                        disabled={busy || changePassword.length === 0}
                                        onClick={() => void runChangePinWithPassword()}
                                    >
                                        {busy ? 'Checking...' : 'Confirm and change PIN'}
                                    </button>
                                    <button type="button" className="btn-link" onClick={() => { reset(); setStage('on'); }}>
                                        Cancel
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <label className="form-label" htmlFor="vault-current-pin">
                                    Current PIN
                                </label>
                                <input
                                    id="vault-current-pin"
                                    type="password"
                                    className="form-control"
                                    value={currentPin}
                                    onChange={e => { setCurrentPin(e.target.value.replace(/\D/g, '')); clearError(); }}
                                    autoComplete="current-password"
                                    inputMode="numeric"
                                />
                                <label className="form-label" htmlFor="vault-newer-pin">New PIN</label>
                                <input
                                    id="vault-newer-pin"
                                    type="password"
                                    className="form-control"
                                    value={pin}
                                    onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
                                    autoComplete="new-password"
                                    inputMode="numeric"
                                />
                                <label className="form-label" htmlFor="vault-confirm-newer-pin">Type it again</label>
                                <input
                                    id="vault-confirm-newer-pin"
                                    type="password"
                                    className="form-control"
                                    value={confirmPin}
                                    onChange={e => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                                    autoComplete="new-password"
                                    inputMode="numeric"
                                />
                                {confirmPin && pin !== confirmPin && (
                                    <p className="t-error-msg" role="alert">Those do not match.</p>
                                )}
                                {pinAttempts > 0 && (
                                    <button
                                        type="button"
                                        className="btn-link"
                                        onClick={() => setUsePassword(true)}
                                    >
                                        I have forgotten my PIN
                                    </button>
                                )}
                                <p className="vault-lock-hint">
                                    Changing the PIN re-wraps the key. Your data is not
                                    re-encrypted, so this is instant and nothing can be
                                    lost.
                                </p>
                                <div className="vault-setup-actions">
                                    <button
                                        type="button"
                                        className="btn-primary"
                                        disabled={busy || !currentPin || pin.length < MIN_PIN_LENGTH || pin !== confirmPin}
                                        onClick={() => void runChangePin()}
                                    >
                                        {busy ? 'Changing...' : 'Change PIN'}
                                    </button>
                                    <button type="button" className="btn-link" onClick={() => { reset(); setStage('on'); }}>
                                        Cancel
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </section>
        </div>
    );
};

export default SecuritySettings;






