/**
 * The alarm sound, synthesised rather than shipped.
 *
 * Three reasons this builds its own audio instead of loading an mp3:
 *
 *  - Nothing to download, so it works on the first frame of a cold offline
 *    start and there is no "loading sound..." state to design around.
 *  - Volume is a gain value, not a re-encoded file, so the slider is real.
 *  - The whole thing is about forty lines and has no asset to go missing.
 *
 * One constraint shapes the code: an AudioContext cannot start without a user
 * gesture, and every way of getting around that is a hack. So nothing here
 * creates a context until the first tap, and the tap is what unlocks it.
 */

let context: AudioContext | null = null;
let master: GainNode | null = null;

/** Nodes scheduled by a chime that is still ringing, so it can be cut short. */
let active: { osc: OscillatorNode[]; gain: GainNode } | null = null;

type AudioContextCtor = typeof AudioContext;

function ctor(): AudioContextCtor | null {
    if (typeof window === 'undefined') return null;
    const candidate = (window as unknown as {
        AudioContext?: AudioContextCtor;
        webkitAudioContext?: AudioContextCtor;
    });
    return candidate.AudioContext ?? candidate.webkitAudioContext ?? null;
}

/**
 * The context, created on demand.
 *
 * Suspended on some browsers until a gesture, and resuming is cheap, so this
 * is safe to call from anywhere. It is called from click handlers first, which
 * is what keeps it unlocked for the rest of the session.
 */
function ensureContext(): AudioContext | null {
    if (context) return context;
    const Ctor = ctor();
    if (!Ctor) return null;
    try {
        context = new Ctor();
    } catch {
        return null;
    }
    master = context.createGain();
    // Held at unity: the per-chime envelope is the only thing shaping level, so
    // that stopping a ringing chime cannot leave the master gain somewhere odd.
    master.gain.value = 1;
    master.connect(context.destination);
    return context;
}

/**
 * Unlock audio from a user gesture.
 *
 * Called from the first tap on the page rather than lazily at fire time, because
 * by the time a timer expires there is no gesture left to offer and a suspended
 * context would silently produce nothing. Returns nothing because the caller
 * has no action to take either way.
 */
export function unlockAudio(): void {
    const ctx = ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
}

interface ToneOptions {
    freq: number;
    /** Offset from the start of the chime, in seconds. */
    at?: number;
    duration: number;
    /** 0..1, relative to the master gain. */
    gain: number;
    type?: OscillatorType;
    /** Fade in over this many seconds; a struck sound needs almost none. */
    attack?: number;
}

function tone(ctx: AudioContext, bus: GainNode, options: ToneOptions): OscillatorNode {
    const { freq, at = 0, duration, gain, type = 'sine', attack = 0.005 } = options;
    const start = ctx.currentTime + at;

    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    // Linear rather than exponential: an exponential ramp cannot reach or leave
    // zero, and a gain that ends at 0.0001 is an audible click on some
    // hardware. Linear to a true zero is inaudible.
    env.gain.linearRampToValueAtTime(gain, start + attack);
    env.gain.linearRampToValueAtTime(0, start + duration);

    osc.connect(env);
    env.connect(bus);
    osc.start(start);
    osc.stop(start + duration + 0.02);
    return osc;
}

/**
 * The chime, written as a short score: an array of tones with timings.
 *
 * Read as "what this sound is made of" rather than as parameters. A fundamental
 * with its fifth and octave above it, the upper two decaying faster, which is
 * what makes it read as struck metal rather than as a flat chord.
 */
const SCORE: ToneOptions[] = [
    { freq: 880, duration: 1.1, gain: 0.5, attack: 0.002 },
    { freq: 1318.5, at: 0.09, duration: 1.4, gain: 0.36, attack: 0.002 },
    { freq: 1760, at: 0.18, duration: 1.6, gain: 0.16, attack: 0.002 },
];

/**
 * Play the chime once.
 *
 * A running chime is cut off rather than layered with the next one. Without
 * that, an interval timer crossing three phases quickly stacks three sets of
 * oscillators on top of each other and the peak level climbs until it clips.
 */
export function playChime(volume: number): void {
    const ctx = ensureContext();
    if (!ctx || !master) return;
    if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
    stopChime();

    const level = Math.max(0, Math.min(1, volume));

    const bus = ctx.createGain();
    bus.gain.value = level;
    bus.connect(master);

    const oscs = SCORE.map(options => tone(ctx, bus, options));
    active = { osc: oscs, gain: bus };
}

/** Silence a ringing chime immediately. Safe to call when nothing is playing. */
export function stopChime(): void {
    if (!active || !context) return;
    const { osc, gain } = active;
    active = null;
    try {
        const now = context.currentTime;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        // A short ramp rather than an instant cut: stopping a GainNode dead is
        // a step discontinuity, which is a click.
        gain.gain.linearRampToValueAtTime(0, now + 0.04);
        for (const node of osc) {
            try {
                node.stop(now + 0.05);
            } catch {
                // Already stopped. Calling stop twice throws in some engines and
                // there is nothing to recover from, so it is swallowed here.
            }
        }
    } catch {
        // A context closed underneath us. Nothing left to silence.
    }
}