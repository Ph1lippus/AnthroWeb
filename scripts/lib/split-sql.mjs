/**
 * Split a SQL script into top-level statements.
 *
 * Both verification scripts need this and they must agree on what a statement
 * is, otherwise a migration can pass one harness and fail in the other. The
 * cases that actually bite here:
 *
 *  - `'...'` and `"..."` literals, in which a `;` is just a character. A `\` is
 *    an escape in a Postgres literal, so `'it\'s'` must not end the literal --
 *    without that, every later semicolon in the file is swallowed.
 *  - `--` line comments. sql.sql and the migrations both carry long ones, and a
 *    `;` inside a comment is not a terminator. An apostrophe in a comment
 *    ("the template's day") must not open a literal either.
 *  - `$$ ... $$` dollar-quoted bodies, which is how every function and DO block
 *    in supabase/migrations is written. These contain semicolons, single quotes
 *    and `--` freely, so neither of the rules above can be applied inside them.
 *    The tag is arbitrary (`$function$`, `$body$`), so this matches any `$$`
 *    rather than assuming the empty tag.
 *
 * Comments are dropped rather than kept, because the callers pass each statement
 * to `exec` on its own and a leading comment would otherwise ride along with the
 * statement that follows it.
 */
export const splitStatements = sql => {
    const parts = [];
    let current = '';
    let quote = null;      // the open delimiter: "'", '"' or '$$'
    for (let i = 0; i < sql.length; i++) {
        const char = sql[i];

        if (quote === '$$') {
            current += char;
            if (char === '$' && sql[i + 1] === '$') { current += sql[++i]; quote = null; }
            continue;
        }

        if (quote) {
            current += char;
            if (char === '\\' && quote === "'") { current += sql[++i] ?? ''; continue; }
            if (char === quote) quote = null;
            continue;
        }

        if (sql.startsWith('$$', i)) { quote = '$$'; current += '$$'; i++; continue; }
        if (char === "'" || char === '"') { quote = char; current += char; continue; }

        if (sql.startsWith('--', i)) {
            const end = sql.indexOf('\n', i);
            i = end === -1 ? sql.length : end;
            continue;
        }

        if (char === ';') { parts.push(current); current = ''; continue; }
        current += char;
    }
    if (current.trim()) parts.push(current);
    return parts.map(part => part.trim()).filter(Boolean);
};

/**
 * Apply every statement, retrying whatever could not run yet.
 *
 * Returns null when all of them landed, or the first unrecoverable failure. A
 * statement is retried only when it failed on a relation that does not exist --
 * any other error is its own, and retrying it would loop forever on a genuine
 * syntax error.
 *
 * sql.sql is a GUI export whose tables reference each other in both directions,
 * so the retry is not a workaround: `workout_template_exercises.session_id`
 * points at `workout_plan_sessions`, which points back at it.
 */
export const applyAllStatements = async (db, sql) => {
    let queue = splitStatements(sql);
    for (let pass = 0; pass <= queue.length; pass++) {
        const deferred = [];
        let failure = null;
        for (const statement of queue) {
            try {
                await db.exec(statement);
            } catch (error) {
                if (/does not exist|not yet exists|foreign key/i.test(error.message)) {
                    deferred.push(statement);
                } else {
                    failure ??= error.message;
                }
            }
        }
        if (failure) return failure;
        if (deferred.length === 0) return null;
        if (deferred.length === queue.length) {
            // A full round with no progress: what is left cannot be satisfied.
            const { rows } = await db.query(
                `select c.relname as table from pg_class c
                   join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname = 'public' and c.relkind = 'r'`,
            ).catch(() => ({ rows: [] }));
            return `${deferred.length} statements unresolved, ${rows.length} tables created`
                + ` (${deferred[0].slice(0, 60)}...)`;
        }
        queue = deferred;
    }
    return 'gave up after too many passes';
};
