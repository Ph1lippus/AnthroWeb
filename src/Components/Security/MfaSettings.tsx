import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useNotice } from '../Feedback/useNotice';
import { ShieldCheck, Trash2 } from 'lucide-react';

interface Factor {
    id: string;
    friendly_name?: string | null;
    status: string;
}

const MfaSettings: React.FC = () => {
    const { notify } = useNotice();
    const [factors, setFactors] = useState<Factor[]>([]);
    const [loading, setLoading] = useState(false);
    const [enrolling, setEnrolling] = useState(false);
    const [factorId, setFactorId] = useState<string | null>(null);
    const [qrCode, setQrCode] = useState<string | null>(null);
    const [secret, setSecret] = useState<string | null>(null);
    const [code, setCode] = useState('');
    const [challengeId, setChallengeId] = useState<string | null>(null);

    const messageOf = (err: unknown, fallback: string) => {
        if (err instanceof Error && err.message) return err.message;
        const anyErr = err as { message?: string; error_description?: string; msg?: string };
        if (anyErr?.message) return anyErr.message;
        if (anyErr?.error_description) return anyErr.error_description;
        if (anyErr?.msg) return anyErr.msg;
        try { return JSON.stringify(err); } catch { return fallback; }
    };

    const loadFactors = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.auth.mfa.listFactors();
            if (error) throw error;
            setFactors((data?.totp ?? []) as Factor[]);
        } catch (err) {
            console.error('MFA listFactors error:', err);
            notify('error', messageOf(err, 'Could not load MFA factors.'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const { data, error } = await supabase.auth.mfa.listFactors();
                if (error) throw error;
                if (!cancelled) setFactors((data?.totp ?? []) as Factor[]);
            } catch (err) {
                if (!cancelled) {
                    console.error('MFA listFactors error:', err);
                    notify('error', messageOf(err, 'Could not load MFA factors.'));
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [notify]);

    const cleanupUnverifiedFactors = async () => {
        try {
            const { data } = await supabase.auth.mfa.listFactors();
            const unverified = (data?.totp ?? []).filter((f: Factor) => f.status !== 'verified');
            for (const f of unverified) {
                await supabase.auth.mfa.unenroll({ factorId: f.id });
            }
        } catch (err) {
            console.error('MFA cleanup error:', err);
        }
    };

    const startEnroll = async () => {
        setLoading(true);
        try {
            await cleanupUnverifiedFactors();

            const { data: existing } = await supabase.auth.mfa.listFactors();
            const verified = (existing?.totp ?? []).filter((f: Factor) => f.status === 'verified');
            if (verified.length > 0) {
                notify('info', 'Two-factor authentication is already enabled.');
                await loadFactors();
                return;
            }

            const friendlyName = `AnthroWeb authenticator ${Date.now()}`;
            const { data, error } = await supabase.auth.mfa.enroll({
                factorType: 'totp',
                friendlyName,
                issuer: 'AnthroWeb',
            });
            if (error) throw error;
            setFactorId(data.id);
            setQrCode(data.totp.qr_code);
            setSecret(data.totp.secret);
            setEnrolling(true);
            const { data: ch, error: chErr } = await supabase.auth.mfa.challenge({ factorId: data.id });
            if (chErr) throw chErr;
            setChallengeId(ch.id);
        } catch (err) {
            console.error('MFA enroll error:', err);
            notify('error', messageOf(err, 'Could not start MFA enrollment.'));
            await cleanupUnverifiedFactors();
            setEnrolling(false);
            setFactorId(null);
            setQrCode(null);
            setSecret(null);
            setChallengeId(null);
        } finally {
            setLoading(false);
        }
    };

    const verifyEnroll = async () => {
        if (!factorId || !challengeId) return;
        setLoading(true);
        try {
            const { error } = await supabase.auth.mfa.verify({
                factorId,
                challengeId,
                code,
            });
            if (error) throw error;
            notify('success', 'Two-factor authentication enabled.');
            setEnrolling(false);
            setFactorId(null);
            setQrCode(null);
            setSecret(null);
            setCode('');
            setChallengeId(null);
            await loadFactors();
        } catch (err) {
            console.error('MFA verify error:', err);
            notify('error', messageOf(err, 'Invalid code.'));
        } finally {
            setLoading(false);
        }
    };

    const unenroll = async (id: string) => {
        if (!confirm('Remove this authenticator? You will sign in with password only.')) return;
        setLoading(true);
        try {
            const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
            if (error) throw error;
            notify('success', 'Authenticator removed.');
            await loadFactors();
        } catch (err) {
            console.error('MFA unenroll error:', err);
            notify('error', messageOf(err, 'Could not remove authenticator.'));
        } finally {
            setLoading(false);
        }
    };

    const verified = factors.filter(f => f.status === 'verified');

    return (
        <section className="vault-settings-section">
            <h2 className="vault-settings-heading">Two-factor authentication (TOTP)</h2>
            <p className="vault-settings-blurb">
                Add an authenticator app (Google Authenticator, Authy, 1Password, …) so
                signing in requires a code in addition to your password.
            </p>

            {loading && <p className="vault-lock-hint">Working…</p>}

            <button
                type="button"
                className="btn-action"
                disabled={loading}
                onClick={async () => {
                    setLoading(true);
                    try {
                        const { data, error } = await supabase.auth.mfa.listFactors();
                        console.log('MFA listFactors:', data, error);
                        if (error) notify('error', messageOf(error, 'MFA check failed'));
                        else notify('success', `MFA factors: ${JSON.stringify(data)}`);
                    } finally {
                        setLoading(false);
                    }
                }}
            >
                Test MFA connection
            </button>

            {!enrolling && verified.length === 0 && (
                <button type="button" className="btn-primary" onClick={() => void startEnroll()} disabled={loading}>
                    Enable two-factor authentication
                </button>
            )}

            {!enrolling && verified.length > 0 && (
                <div className="vault-setup">
                    <p className="vault-lock-confirm">
                        <ShieldCheck size={16} aria-hidden="true" />
                        Two-factor authentication is on.
                    </p>
                    <ul className="vault-phrase">
                        {verified.map(f => (
                            <li key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>{f.friendly_name || 'Authenticator'}</span>
                                <button type="button" className="btn-action vault-lock-danger" onClick={() => void unenroll(f.id)} disabled={loading}>
                                    <Trash2 size={14} /> Remove
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {enrolling && qrCode && (
                <div className="vault-setup">
                    <p className="vault-lock-hint">
                        Scan this QR code with your authenticator app, then enter the
                        6-digit code it shows.
                    </p>
                    <img src={qrCode} alt="TOTP QR code" style={{ width: 180, height: 180, margin: '0.5rem 0' }} />
                    {secret && (
                        <p className="vault-lock-hint" style={{ wordBreak: 'break-all' }}>
                            Manual entry secret: <code>{secret}</code>
                        </p>
                    )}
                    <label className="form-label" htmlFor="mfa-code">Authentication code</label>
                    <input
                        id="mfa-code"
                        className="form-control"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={code}
                        onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    />
                    <div className="vault-setup-actions">
                        <button type="button" className="btn-primary" disabled={loading || code.length !== 6} onClick={() => void verifyEnroll()}>
                            {loading ? 'Verifying…' : 'Verify and enable'}
                        </button>
                        <button type="button" className="btn-link" onClick={() => { void cleanupUnverifiedFactors(); setEnrolling(false); setFactorId(null); setQrCode(null); setSecret(null); setCode(''); setChallengeId(null); }}>
                            Cancel
                        </button>
                    </div>
                </div>
            )}
        </section>
    );
};

export default MfaSettings;