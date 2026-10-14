/**
 * The master key: what it is, where it lives, and how it gets wrapped.
 *
 * There is exactly one master key per user, it is 32 random bytes, and it is
 * generated on the device that sets the PIN. It is never transmitted, never
 * written to storage in the clear, and never leaves this module except as a
 * `CryptoKey` handed to `seal`/`open`.
 *
 * It is held in memory only while the app is unlocked. Locking calls
 * `lockKeyring()`, which overwrites the raw bytes and drops the `CryptoKey`;
 * there is nothing on disk to restore from, so the only way back in is the PIN
 * or the recovery phrase.
 *
 * Two wrapped copies are stored server-side:
 *
 *   master key --AES-GCM--> vault_pin_wrapped        (under PBKDF2(PIN))
 *   master key --AES-GCM--> vault_recovery_wrapped    (under PBKDF2(phrase))
 *
 * Both are in `user_settings` and both are inert without the corresponding
 * secret. An attacker holding the entire database, including every wrapped copy,
 * still has to get past a 600k-iteration PBKDF2 to try a PIN -- which is the
 * whole reason the PIN wrap is not the only wrap. The recovery wrap exists so
 * that a forgotten PIN is an inconvenience rather than permanent loss.
 *
 * On the weakness this design accepts: a PIN is a small secret. Ten digits is
 * 10^10 candidates, and an attacker who can make offline attempts against the
 * wrapped key is not stopped forever by the iteration count -- 600k iterations
 * is roughly a fifth of a second of work per guess on a server GPU, so a
 * motivated attacker with the database eventually reaches the key. What that
 * buys is time, and it is why the honest framing for a user is that a PIN is a
 * lock against someone picking up an unlocked device, not against a determined
 * party who already has a copy of the database. The recovery key should be kept
 * somewhere that is not the same device.
 */

import { decodeBase64Utf8, encodeBase64Utf8, fromBase64, isCryptoAvailable, randomBytes, toBase64, wipeBytes } from '../crypto/bytes';
import {
    KEY_BYTES,
    PBKDF2_ITERATIONS,
    SALT_BYTES,
    VAULT_FORMAT_VERSION,
    deriveKey,
    importRawKey,
    seal,
    tryOpen,
} from '../crypto/cipher';

export const MIN_PIN_LENGTH = 6;
export const MAX_PIN_LENGTH = 64;

/**
 * How long to refuse an attempt after N consecutive failures.
 *
 * One table, used by the app PIN and by every per-note PIN. They were separate
 * curves for a while -- this one exponential, that one a fixed ladder -- which
 * meant the same mistake could be tested against one and shipped into the other.
 *
 * The shape is the standard one: three attempts cost nothing, because three is
 * what a fat-fingered PIN actually takes, and everything after that escalates
 * until it stops being worth automating. A 4-digit note PIN is 10^4 candidates,
 * which an attacker holding the stored ciphertext exhausts offline in minutes --
 * except they still need the account password, because that is now a second
 * independent wrap. The ladder is priced against that second factor rather than
 * against a single 4-digit guess.
 *
 * 24 hours at the end is the part that matters: it does not merely delay, it
 * turns a script that finishes overnight into one that has to be restarted every
 * day, which is where automated attacks actually die.
 *
 * The counter behind this is server-side -- `vault_failed_attempts` for the app
 * PIN, `lock_failed_attempts` per note -- so clearing browser storage buys nobody
 * a fresh set of attempts.
 */
export const BACKOFF_MS = [
  0, // no failures yet
  0, // 1st failure -- a typo, not an attack
  0, // 2nd -- still a typo
  60_000, // 3rd -- one minute
  300_000, // 4th -- five minutes
  1_800_000, // 5th -- thirty minutes
  7_200_000, // 6th -- two hours
  86_400_000, // 7th and after -- one day
];

/** Attempts allowed before the ladder starts costing anything. */
export const FREE_ATTEMPTS = 3;

/** "Try again in 20 minutes", for a countdown label. */
export const describeRetry = (ms: number): string => {
  const s = Math.ceil(ms / 1000);
  if (s <= 0) return '';
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
  const m = Math.ceil(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`;
  const h = Math.ceil(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'}`;
  return `${Math.ceil(h / 24)} day${h >= 48 ? 's' : ''}`;
};

export const retryAfterMs = (attempts: number): number =>
    BACKOFF_MS[Math.max(0, Math.min(attempts, BACKOFF_MS.length - 1))];

/** Number of recovery words. 24 gives 300 bits of entropy at 12 bits per word. */
export const RECOVERY_WORDS = 24;

/**
 * BIP-39's English wordlist.
 *
 * 2048 words is what gives 11 bits per word, and it is the list people already
 * recognise from every other tool that asks for a recovery phrase. Carrying it
 * inline rather than fetching it means the recovery phrase can be generated and
 * restored with no network and no supply chain -- a fetched wordlist is a
 * dependency that could serve a different list tomorrow, and every word
 * generated with it would then be unusable.
 */
// prettier-ignore
const RECOVERY_WORDLIST = (
  'abandon ability able about above absent absorb abstract absurd abuse access accident ' +
  'account accuse achieve acid acoustic acquire across act action actor actress actual ' +
  'adapt add addict address adjust admit adult advance advice aerobic affair afford ' +
  'afraid again age agent agree ahead aim air airport aisle alarm album alcohol alert ' +
  'alien all alley allow almost alone alpha already also alter always amateur amazing ' +
  'among amount amused analyst anchor ancient anger angle angry animal ankle announce ' +
  'annual another answer antenna antique anxiety any apart apology appear apple approve ' +
  'april arch arctic area arena argue arm armed armor army around arrange arrest arrive ' +
  'arrow art artefact artist artwork ask aspect assault asset assist assume asthma athlete ' +
  'atom attack attend attitude attract auction audit august aunt author auto autumn ' +
  'average avocado avoid awake aware away awesome awful awkward axis baby bachelor bacon ' +
  'badge bag balance balcony ball bamboo banana banner bar barely bargain barrel base ' +
  'basic basket battle beach bean beauty because become beef before begin behave behind ' +
  'believe below belt bench benefit best betray better between beyond bicycle bid bike ' +
  'bind biology bird birth bitter black blade blame blanket blast bleak bless blind blood ' +
  'blossom blouse blue blur blush board boat body boil bomb bone bonus book boost border ' +
  'boring borrow boss bottom bounce box boy bracket brain brand brass brave bread breeze ' +
  'brick bridge brief bright bring brisk broccoli broken bronze broom brother brown ' +
  'brush bubble buddy budget buffalo build bulb bulk bullet bundle bunker burden burger ' +
  'burst bus business busy butter buyer buzz cabbage cabin cable cactus cage cake call ' +
  'calm camera camp can canal cancel candy cannon canoe canvas canyon capable capital ' +
  'captain car carbon card cargo carpet carry cart case cash casino castle casual cat ' +
  'catalog catch category cattle caught cause caution cave ceiling celery cement census ' +
  'century cereal certain chair chalk champion change chaos chapter charge chase chat ' +
  'cheap check cheese chef cherry chest chicken chief child chimney choice choose chronic ' +
  'chuckle chunk churn cigar cinnamon circle citizen city civil claim clap clarify claw ' +
  'clay clean clerk clever click client cliff climb clinic clip clock clog close cloth ' +
  'cloud clown club clump cluster clutch coach coast coconut code coffee coil coin collect ' +
  'color column combine come comfort comic common company concert conduct confirm congress ' +
  'connect consider control convince cook cool copper copy coral core corn correct cost ' +
  'cotton couch country couple course cousin cover coyote crack cradle craft cram crane ' +
  'crash crater crawl crazy cream credit creek crew cricket crime crisp critic crop cross ' +
  'crouch crowd crucial cruel cruise crumble crunch crush cry crystal cube culture cup ' +
  'cupboard curious current curtain curve cushion custom cute cycle dad damage damp dance ' +
  'danger daring dash daughter dawn day deal debate debris decade december decide decline ' +
  'decorate decrease deer defense define defy degree delay deliver demand demise denial ' +
  'dentist deny depart depend deposit depth deputy derive describe desert design desk ' +
  'despair destroy detail detect develop device devote diagram dial diamond diary dice ' +
  'diesel diet differ digital dignity dilemma dinner dinosaur direct dirt disagree ' +
  'discover disease dish dismiss disorder display distance divert divide divorce dizzy ' +
  'doctor document dog doll dolphin domain donate donkey donor door dose double dove ' +
  'draft dragon drama drastic draw dream dress drift drill drink drip drive drop drum ' +
  'dry duck dumb dune during dust dutch duty dwarf dynamic eager eagle early earn earth ' +
  'easily east easy echo ecology economy edge edit educate effort egg eight either elbow ' +
  'elder electric elegant element elephant elevator elite else embark embody embrace ' +
  'emerge emotion employ empower empty enable enact end endless endorse enemy energy ' +
  'enforce engage engine enhance enjoy enlist enough enrich enroll ensure enter entire ' +
  'entry envelope episode equal equip era erase erode erosion error erupt escape essay ' +
  'essence estate eternal ethics evidence evil evoke evolve exact example excess exchange ' +
  'excite exclude excuse execute exercise exhaust exhibit exile exist exit exotic expand ' +
  'expect expire explain expose express extend extra eye eyebrow fabric face faculty fade ' +
  'faint faith fall false fame family famous fan fancy fantasy farm fashion fat fatal ' +
  'father fatigue fault favorite feature february federal fee feed feel female fence ' +
  'festival fetch fever few fiber fiction field figure file film filter final find fine ' +
  'finger finish fire firm first fiscal fish fit fitness fix flag flame flash flat flavor ' +
  'flee flight flip float flock floor flower fluid flush fly foam focus fog foil fold ' +
  'follow food foot force forest forget fork fortune forum forward fossil foster found ' +
  'fox fragile frame frequent fresh friend fringe frog front frost frown frozen fruit ' +
  'fuel fun funny furnace fury future gadget gain galaxy gallery game gap garage garbage ' +
  'garden garlic garment gas gasp gate gather gauge gaze general genius genre gentle genuine ' +
  'gesture ghost giant gift giggle ginger giraffe girl give glad glance glare glass glide ' +
  'glimpse globe gloom glory glove glow glue goat goddess gold good goose gorilla gospel ' +
  'gossip govern gown grab grace grain grant grape grass gravity great green grid grief ' +
  'grit grocery group grow grunt guard guess guide guilt guitar gun gym habit hair half ' +
  'hammer hamster hand happy harbor hard harsh harvest hat have hawk hazard head health ' +
  'heart heavy hedgehog height hello helmet help hen hero hidden high hill hint hip ' +
  'hire history hobby hockey hold hole holiday hollow home honey hood hope horn horror ' +
  'horse hospital host hotel hour hover hub huge human humble humor hundred hungry hunt ' +
  'hurdle hurry hurt husband hybrid ice icon idea identify idle ignore ill illegal illness ' +
  'image imitate immense immune impact impose improve impulse inch include income increase ' +
  'index indicate indoor industry infant inflict inform inhale inherit initial inject ' +
  'injury inmate inner innocent input inquiry insane insect inside inspire install intact ' +
  'interest into invest invite involve iron island isolate issue item ivory jacket jaguar ' +
  'jar jazz jealous jeans jelly jewel job join joke journey joy judge juice jump jungle ' +
  'junior junk just kangaroo keen keep ketchup key kick kid kidney kind kingdom kiss kit ' +
  'kitchen kite kitten kiwi knee knife knock know lab label labor ladder lady lake lamp ' +
  'language laptop large later latin laugh laundry lava law lawn lawsuit layer lazy leader ' +
  'leaf learn leave lecture left leg legal legend leisure lemon lend length lens leopard ' +
  'lesson letter level liar liberty library license life lift light like limb limit link ' +
  'lion liquid list little live lizard load loan lobster local lock logic lonely long ' +
  'loop lottery loud lounge love loyal lucky luggage lumber lunar lunch luxury lyrics machine ' +
  'mad magic magnet maid mail main major make mammal man manage mandate mango mansion ' +
  'manual maple marble march margin marine market marriage mask mass master match material ' +
  'math matrix matter maximum maze meadow mean measure meat mechanic medal media melody ' +
  'melt member memory mention menu mercy merge merit merry mesh message metal method middle ' +
  'midnight milk million mimic mind minimum minor minute miracle mirror misery miss mistake ' +
  'mix mixed mixture mobile model modify mom moment monitor monkey monster month moon ' +
  'moral more morning mosquito mother motion motor mountain mouse move movie much muffin ' +
  'mule multiply muscle museum mushroom music must mutual myself mystery myth naive name ' +
  'napkin narrow nasty nation nature near neck need negative neglect neither nephew nerve ' +
  'nest net network neutral never news next nice night noble noise nominee noodle normal ' +
  'north nose notable note nothing notice novel now nuclear number nurse nut oak obey object ' +
  'oblige obscure observe obtain obvious occur ocean october odor off offer office often ' +
  'oil okay old olive olympic omit once one onion online only open opera opinion oppose ' +
  'option orange orbit orchard order ordinary organ orient original orphan ostrich other ' +
  'outdoor outer output outside oval oven over own owner oxygen oyster ozone pact paddle ' +
  'page pair palace palm panda panel panic panther paper parade parent park parrot party ' +
  'pass patch path patient patrol pattern pause pave payment peace peanut pear peasant pelican ' +
  'pen penalty pencil people pepper perfect permit person pet phone photo phrase physical ' +
  'piano picnic picture piece pig pigeon pill pilot pink pioneer pipe pistol pitch pizza ' +
  'place planet plastic plate play please pledge pluck plug plunge poem poet point polar ' +
  'pole police pond pony pool popular portion position possible post potato pottery poverty ' +
  'powder power practice praise predict prefer prepare present pretty prevent price pride ' +
  'primary print priority prison private prize problem process produce profit program ' +
  'project promote proof property prosper protect proud provide public pudding pull pulp ' +
  'pulse pumpkin punch pupil puppy purchase purity purpose purse push put puzzle pyramid ' +
  'quality quantum quarter question quick quit quiz quote rabbit raccoon race rack radar ' +
  'radio rail rain raise rally ramp ranch random range rapid rare rate rather raven raw ' +
  'razor ready real reason rebel rebuild recall receive recipe record recycle reduce reflect ' +
  'reform refuse region regret regular reject relax release relief rely remain remember ' +
  'remind remove render renew rent reopen repair repeat replace report require rescue ' +
  'resemble resist resource response result retire retreat return reunion reveal review ' +
  'reward rhythm rib ribbon rice rich ride ridge rifle right rigid ring riot ripple risk ' +
  'ritual rival river road roast robot robust rocket romance roof rookie room rose rotate ' +
  'rough round route royal rubber rude rug rule run runway rural sad saddle sadness safe ' +
  'sail salad salmon salon salt salute same sample sand satisfy satoshi sauce sausage save ' +
  'say scale scan scare scatter scene scheme school science scissors scorpion scout scrap ' +
  'screen script scrub sea search season seat second secret section security seed seek ' +
  'segment select sell seminar senior sense sentence series service session settle setup ' +
  'seven shadow shaft shallow share shed shell sheriff shield shift shine ship shiver shock ' +
  'shoe shoot shop short shoulder shove shrimp shrug shuffle shy sibling sick side siege ' +
  'sight sign silent silk silly silver similar simple since sing siren sister situate six ' +
  'size skate sketch ski skill skin skirt skull slab slam sleep slender slice slide slight ' +
  'slim slogan slot slow slush small smart smile smoke smooth snack snake snap sniff snow ' +
  'soap soccer social sock soda soft solar soldier solid solution solve someone song soon ' +
  'sorry sort soul sound soup source south space spare spatial spawn speak special speed ' +
  'spell spend sphere spice spider spike spin spirit split spoil sponsor spoon sport spot ' +
  'spray spread spring spy square squeeze squirrel stable stadium staff stage stairs stamp ' +
  'stand start state stay steak steel stem step stereo stick still sting stock stomach ' +
  'stone stool story stove strategy street strike strong struggle student stuff stumble ' +
  'style subject submit subway success such sudden suffer sugar suggest suit summer sun ' +
  'sunny sunset super supply supreme sure surface surge surprise surround survey suspect ' +
  'sustain swallow swamp swap swarm swear sweet swift swim swing switch sword symbol symptom ' +
  'syrup system table tackle tag tail talent talk tank tape target task taste tattoo taxi ' +
  'teach team tell ten tenant tennis tent term test text thank that theme then theory there ' +
  'they thing this thought three thrive throw thumb thunder ticket tide tiger tilt timber ' +
  'time tiny tip tired tissue title toast tobacco today toddler toe together toilet token ' +
  'tomato tomorrow tone tongue tonight tool tooth top topic topple torch tornado tortoise ' +
  'toss total tourist toward tower town toy track trade traffic tragic train transfer trap ' +
  'trash travel tray treat tree trend trial tribe trick trigger trim trip trophy trouble ' +
  'truck true truly trumpet trust truth try tube tuition tumble tuna tunnel turkey turn ' +
  'turtle twelve twenty twice twin twist two type typical ugly umbrella unable unaware uncle ' +
  'uncover under undo unfair unfold unhappy uniform unique unit universe unknown unlock until ' +
  'unusual unveil update upgrade uphold upon upper upset urban urge usage use used useful ' +
  'useless usual utility vacant vacuum vague valid valley valve van vanish vapor various ' +
  'vast vault vehicle velvet vendor venture venue verb verify version very vessel veteran ' +
  'viable vibrant vicious victory video view village vintage violin virtual virus visa ' +
  'visit visual vital vivid vocal voice void volcano volume vote voyage wage wagon wait ' +
  'walk wall walnut want warfare warm warrior wash wasp waste water wave way wealth weapon ' +
  'wear weasel weather web wedding weekend weird welcome west wet whale what wheat wheel ' +
  'when where whip whisper wide width wife wild will win window wine wing wink winner winter ' +
  'wire wisdom wise wish witness wolf woman wonder wood wool word work world worry worth ' +
  'wrap wreck wrestle wrist write wrong yard year yellow you young youth zebra zero zone zoo'
).split(' ');

/** Everything the server stores about an armed vault. */
export interface VaultSettings {
    vault_enabled: boolean;
    vault_pin_salt: string | null;
    vault_pin_iterations: number | null;
    vault_pin_wrapped: string | null;
    vault_recovery_salt: string | null;
    vault_recovery_iterations: number | null;
    vault_recovery_wrapped: string | null;
    /**
     * Consecutive failed app-PIN attempts, and when they stop counting.
     *
     * Server-side on purpose. The per-note lock has always stored its counter in
     * the row, and the app PIN having none was an oversight rather than a
     * decision -- `unlock` leaned on "the derivation is slow" instead. Slow is
     * not a control: anyone who can open the page can run as many derivations as
     * they like, and clearing local storage would have reset any client counter
     * anyway.
     */
    vault_failed_attempts?: number | null;
    vault_retry_after?: string | null;
}

/**
 * Milliseconds remaining on the app-PIN lockout, or 0 when there is none.
 *
 * Reads the absolute deadline rather than a countdown, so the number stays
 * correct across a page reload, a sleep, or a clock the user has changed.
 */
export const appRetryRemainingMs = (
    settings: Pick<VaultSettings, 'vault_retry_after'> | null | undefined,
    now = Date.now(),
): number => {
    const until = settings?.vault_retry_after;
    if (!until) return 0;
    const remaining = new Date(until).getTime() - now;
    return Number.isFinite(remaining) && remaining > 0 ? remaining : 0;
};

/** Whether the app PIN may be tried at all right now. */
export const isAppCoolingDown = (
    settings: Pick<VaultSettings, 'vault_retry_after'> | null | undefined,
    now = Date.now(),
): boolean => appRetryRemainingMs(settings, now) > 0;

/** What enabling the vault produces, ready to write to `user_settings`. */
export interface VaultProvisioning {
    vault_enabled: true;
    vault_version: number;
    vault_enabled_at: string;
    vault_pin_salt: string;
    vault_pin_iterations: number;
    vault_pin_wrapped: string;
    vault_recovery_salt: string;
    vault_recovery_iterations: number;
    vault_recovery_wrapped: string;
}

/** AAD for the wrapped master key. Not row-bound: there is one key, not many. */
const WRAP_AAD = `anthroweb/v${VAULT_FORMAT_VERSION}|master-key`;

const RECOVERY_JOINER = ' ';

let masterRaw: Uint8Array<ArrayBuffer> | null = null;
let masterKey: CryptoKey | null = null;

/** The derived master key, or `null` while locked. */
export const getMasterKey = (): CryptoKey | null => masterKey;

/** Whether the vault is currently open. */
export const isVaultOpen = (): boolean => masterKey !== null;

/** Whether the vault is unlocked in this tab right now. */
export const isUnlocked = (): boolean => masterKey !== null;

/** Whether this browser can run the vault at all. */
export const canUseVault = (): boolean => isCryptoAvailable();

/**
 * Overwrite the key material and drop the handle.
 *
 * Called on explicit lock, on idle timeout, and when the tab is backgrounded if
 * the user asked for that. The `fill(0)` is the part that matters: dropping the
 * reference only marks the buffer for collection, so without it a later heap
 * read can still find the bytes.
 */
export const lockKeyring = (): void => {
    wipeBytes(masterRaw);
    masterRaw = null;
    masterKey = null;
};

/** AAD for the wrapped key under one particular secret. */
const wrapAadFor = (purpose: 'pin' | 'recovery' | 'note-pin' | 'note-master' | 'note-recovery'): string =>
    `${WRAP_AAD}|${purpose}`;

const holdMaster = (raw: Uint8Array<ArrayBuffer>): void => {
    wipeBytes(masterRaw);
    masterRaw = raw;
    masterKey = null;
};

/**
 * Generate a 24-word BIP-39 recovery phrase.
 *
 * 24 words is 256 bits of entropy plus an 8-bit checksum, chunked 11 bits at a
 * time into the 2048-word list. The checksum is what makes this BIP-39 rather
 * than 24 random words: it is the first byte of SHA-256 over the entropy, so a
 * phrase with a mistyped or reordered word fails its own checksum and says so,
 * instead of silently unwrapping nothing and looking like a lost vault. It is
 * also why the list has to be the real one -- a wordlist that has drifted
 * produces phrases that no other BIP-39 tool can read.
 */
export const generateRecoveryPhrase = async (): Promise<string> => {
    const entropy = randomBytes(32); // 256 bits -> 24 words
    const digest = new Uint8Array<ArrayBuffer>(await crypto.subtle.digest('SHA-256', toArrayBuffer(entropy)));
    const checksum = digest[0];

    const bits: number[] = [];
    for (const byte of entropy) {
        for (let i = 7; i >= 0; i--) bits.push((byte >> i) & 1);
    }
    for (let i = 7; i >= 0; i--) bits.push((checksum >> i) & 1);

    const words: string[] = [];
    for (let i = 0; i < bits.length; i += 11) {
        let index = 0;
        for (let j = 0; j < 11; j++) index = (index << 1) | bits[i + j];
        words.push(RECOVERY_WORDLIST[index]);
    }

    wipeBytes(entropy);
    wipeBytes(digest);
    return words.join(RECOVERY_JOINER);
};

/**
 * Validate a phrase's wordlist membership and checksum.
 *
 * Worth having, because "that phrase is wrong" and "the vault is gone" feel the
 * same to a user standing at a lock screen. This says which one it is, before
 * anything has been tried against the wrapped key.
 */
export const validateRecoveryPhrase = async (phrase: string): Promise<boolean> => {
    const words = normaliseRecoveryPhrase(phrase).split(RECOVERY_JOINER);
    if (words.length !== RECOVERY_WORDS) return false;

    const indexes: number[] = [];
    for (const word of words) {
        const index = RECOVERY_WORDLIST.indexOf(word);
        if (index < 0) return false;
        indexes.push(index);
    }

    const bits: number[] = [];
    for (const index of indexes) {
        for (let i = 10; i >= 0; i--) bits.push((index >> i) & 1);
    }
    // Last 8 bits are the checksum; the first 256 are the entropy.
    const entropyBits = bits.slice(0, 256);
    const checksumBits = bits.slice(256);

    const entropy = new Uint8Array(new ArrayBuffer(32));
    for (let i = 0; i < entropyBits.length; i++) {
        if (entropyBits[i]) entropy[i >> 3] |= 1 << (7 - (i & 7));
    }
    const digest = new Uint8Array<ArrayBuffer>(await crypto.subtle.digest('SHA-256', toArrayBuffer(entropy)));
    wipeBytes(entropy);

    for (let i = 0; i < 8; i++) {
        const expected = (digest[0] >> (7 - i)) & 1;
        if (checksumBits[i] !== expected) return false;
    }
    return true;
};

/** Normalise a phrase so spacing and case cannot lock someone out of their data. */
export const normaliseRecoveryPhrase = (phrase: string): string =>
    phrase.trim().toLowerCase().split(/\s+/).filter(Boolean).join(RECOVERY_JOINER);

/**
 * Generate the master key and both of its wraps.
 *
 * Nothing here is recoverable from the caller's side: the raw key is returned to
 * the caller *only* so the immediate seal of existing rows can proceed, and the
 * caller is expected to pass it straight through. It is not stored.
 */
export const provisionVault = async (
    pin: string,
    recoveryPhrase: string,
): Promise<{ provisioning: VaultProvisioning; recoveryPhrase: string }> => {
    if (!canUseVault()) throw new Error('This browser does not support encryption.');
    assertPin(pin);

    const raw = randomBytes(KEY_BYTES);

    const pinSalt = randomBytes(SALT_BYTES);
    const pinKey = await deriveKey(pin, pinSalt, PBKDF2_ITERATIONS);
    const pinWrapped = await seal(pinKey, toBase64(raw), wrapAadFor('pin'));
    // Encoded before the wipe, not after. `wipeBytes` fills the buffer with
    // zeroes, so a `toBase64` further down would encode sixteen zero bytes --
    // which is valid base64, so nothing fails, and every vault provisioned since
    // this ordering was written has stored a salt of all zeroes. It is invisible
    // because both sides of the derivation read the same zeroes, and it is the
    // difference between a salt and no salt.
    const pinSaltEncoded = toBase64(pinSalt);
    wipeBytes(pinSalt);

    const phrase = normaliseRecoveryPhrase(recoveryPhrase);
    const recoverySalt = randomBytes(SALT_BYTES);
    const recoveryKey = await deriveKey(phrase, recoverySalt, PBKDF2_ITERATIONS);
    const recoveryWrapped = await seal(recoveryKey, toBase64(raw), wrapAadFor('recovery'));
    // Same ordering, same reason.
    const recoverySaltEncoded = toBase64(recoverySalt);
    wipeBytes(recoverySalt);

    holdMaster(raw);

    return {
        provisioning: {
            vault_enabled: true,
            vault_version: VAULT_FORMAT_VERSION,
            vault_enabled_at: new Date().toISOString(),
            vault_pin_salt: pinSaltEncoded,
            vault_pin_iterations: PBKDF2_ITERATIONS,
            vault_pin_wrapped: pinWrapped,
            vault_recovery_salt: recoverySaltEncoded,
            vault_recovery_iterations: PBKDF2_ITERATIONS,
            vault_recovery_wrapped: recoveryWrapped,
        },
        recoveryPhrase: phrase,
    };
};

/**
 * Unwrap with a PIN. Returns false rather than throwing on a wrong PIN, so the
 * caller can count attempts without catching.
 *
 * The iteration count comes from the stored row, not from the constant: a user
 * whose vault was provisioned at an older cost factor must still be able to open
 * it, or raising the cost factor would lock them out.
 */
export const unlockWithPin = async (settings: VaultSettings, pin: string): Promise<boolean> => {
    if (!settings.vault_enabled) return false;
    if (!settings.vault_pin_wrapped || !settings.vault_pin_salt || !settings.vault_pin_iterations) return false;

    const pinKey = await deriveKey(pin, fromBase64(settings.vault_pin_salt), settings.vault_pin_iterations);
    const opened = await tryOpen(pinKey, settings.vault_pin_wrapped, wrapAadFor('pin'));
    if (opened === null) return false;

    holdMaster(fromBase64(opened));
    return true;
};

/** Unwrap with a recovery phrase. The way back in when the PIN is gone. */
export const unlockWithRecoveryPhrase = async (
    settings: VaultSettings,
    phrase: string,
): Promise<boolean> => {
    if (!settings.vault_enabled) return false;
    if (!settings.vault_recovery_wrapped || !settings.vault_recovery_salt || !settings.vault_recovery_iterations) {
        return false;
    }

    const key = await deriveKey(
        normaliseRecoveryPhrase(phrase),
        fromBase64(settings.vault_recovery_salt),
        settings.vault_recovery_iterations,
    );
    const opened = await tryOpen(key, settings.vault_recovery_wrapped, wrapAadFor('recovery'));
    if (opened === null) return false;

    holdMaster(fromBase64(opened));
    return true;
};

/**
 * The raw master key bytes.
 *
 * Only for the one-time act of sealing existing rows when the vault is switched
 * on, which has to touch data from before the vault existed. After that the key
 * stays as a `CryptoKey`. Anything that keeps this around is a leak.
 */
export const exportMasterRaw = (): Uint8Array<ArrayBuffer> | null => masterRaw;

/** Load the imported key into the non-extractable handle used for seal/open. */
export const adoptMasterKey = async (): Promise<void> => {
    if (!masterRaw) throw new Error('No master key held');
    masterKey = await importRawKey(masterRaw);
};

/** Re-wrap the master key under a new PIN. Changes 32 bytes, not the vault. */
export const rewrapMasterForPin = async (newPin: string): Promise<{
    vault_pin_salt: string;
    vault_pin_iterations: number;
    vault_pin_wrapped: string;
}> => {
    if (!masterRaw) throw new Error('Vault is locked');
    assertPin(newPin);

    const pinSalt = randomBytes(SALT_BYTES);
    const pinKey = await deriveKey(newPin, pinSalt, PBKDF2_ITERATIONS);
    const pinWrapped = await seal(pinKey, toBase64(masterRaw), wrapAadFor('pin'));
    // Before the wipe, for the same reason as `provisionVault`: encoding the
    // buffer afterwards would store a salt of zeroes.
    const pinSaltEncoded = toBase64(pinSalt);
    wipeBytes(pinSalt);

    return {
        vault_pin_salt: pinSaltEncoded,
        vault_pin_iterations: PBKDF2_ITERATIONS,
        vault_pin_wrapped: pinWrapped,
    };
};

export const assertPin = (pin: string): void => {
    if (pin.length < MIN_PIN_LENGTH) {
        throw new Error(`Your PIN must be at least ${MIN_PIN_LENGTH} characters.`);
    }
    if (pin.length > MAX_PIN_LENGTH) {
        throw new Error(`Your PIN must be at most ${MAX_PIN_LENGTH} characters.`);
    }
};

/** `Uint8Array<ArrayBuffer>` to `ArrayBuffer`, narrowed to the view's own bytes. */
const toArrayBuffer = (bytes: Uint8Array<ArrayBuffer>): ArrayBuffer =>
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;

/** Re-exported so the note lock can share the same base64 helpers. */
export { encodeBase64Utf8, decodeBase64Utf8, fromBase64, toBase64 };
