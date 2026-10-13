import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import {
    persistQueryClient,
    type Persister,
} from '@tanstack/react-query-persist-client'
import type { QueryClient } from '@tanstack/react-query'
import { supabase } from './supabaseClient'

const databaseName = 'anthroweb-query-cache'
const storeName = 'query-cache'
const cacheMaxAge = 24 * 60 * 60 * 1000

const indexedDbStorage: StorageLike = {
    getItem: async (key) => withStore('readonly', store => store.get(key)),
    setItem: async (key, value) => { await withStore('readwrite', store => store.put(value, key)) },
    removeItem: async (key) => { await withStore('readwrite', store => store.delete(key)) },
}

interface StorageLike {
    getItem: (key: string) => Promise<string | null>
    setItem: (key: string, value: string) => Promise<void>
    removeItem: (key: string) => Promise<void>
}

const openDatabase = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
        if (typeof indexedDB === 'undefined') {
            reject(new Error('IndexedDB is unavailable'))
            return
        }

        const request = indexedDB.open(databaseName, 1)
        request.onupgradeneeded = () => {
            request.result.createObjectStore(storeName)
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error ?? new Error('Unable to open IndexedDB'))
    })

const withStore = async <T>(
    mode: IDBTransactionMode,
    operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
    try {
        const database = await openDatabase()
        return await new Promise((resolve, reject) => {
            const transaction = database.transaction(storeName, mode)
            const request = operation(transaction.objectStore(storeName))
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
            transaction.oncomplete = () => database.close()
            transaction.onerror = () => reject(transaction.error)
        })
    } catch {
        // Persistence must never prevent the app from loading or fetching fresh data.
        return null as T
    }
}

const createPersister = (userId: string): Persister =>
    createAsyncStoragePersister({
        storage: indexedDbStorage,
        key: `query-cache:${userId}`,
        throttleTime: 1000,
    })

/**
 * Whether the vault is open. Read lazily through a callback rather than
 * imported, so this module stays free of a dependency on the keyring and the
 * persister can be reasoned about on its own.
 */
let vaultOpenCheck: () => boolean = () => true;

/**
 * Told by the lock layer whether the keyring is open.
 *
 * The cache is the largest plaintext copy of this app's private data that is not
 * the database: every note and every day of journal the user has opened is
 * serialised into IndexedDB, unencrypted, and kept for 24 hours. With the vault
 * armed, writing that while the app is locked would put back on disk exactly what
 * the PIN was set to keep off it.
 */
export const setVaultOpenCheck = (check: () => boolean): void => {
    vaultOpenCheck = check;
};

/**
 * Restores only the current user's cache and starts persistence for subsequent
 * query updates. Auth transitions clear the in-memory cache before switching
 * storage keys, preventing one user's data from being shown to another.
 */
export const initializeQueryPersistence = async (queryClient: QueryClient): Promise<void> => {
    let activePersister: Persister | null = null
    let stopPersistence: (() => void) | null = null
    let activeUserId: string | null = null
    /**
     * Guards against two overlapping switches, and the bookkeeping has to happen
     * before the first `await`.
     *
     * `getSession()` and `onAuthStateChange` both call this, and on a normal
     * launch they race: the session round trip and the auth event both resolve
     * around the same moment. The guard used to read `activeUserId`, which was
     * only assigned after awaiting the previous persister's `removeClient()`, so
     * both callers passed the guard for the same user id. The loser then ran
     * `queryClient.clear()` *after* the winner had restored -- wiping the cache
     * that had just been loaded, which looks exactly like "my data sometimes
     * doesn't load".
     */
    let switchInFlight: Promise<void> = Promise.resolve()

    const switchUser = async (userId: string | null): Promise<void> => {
        if (userId === activeUserId) return

        // Claim the user id synchronously, before anything can await. Every
        // other caller for this id now sees a match and returns immediately.
        activeUserId = userId

        const run = async (): Promise<void> => {
            stopPersistence?.()
            stopPersistence = null
            if (activePersister) await activePersister.removeClient()
            activePersister = null
            queryClient.clear()

            if (!userId) return

            const persister = createPersister(userId)
            activePersister = persister
            const [unsubscribe, restorePromise] = persistQueryClient({
                queryClient,
                persister,
                maxAge: cacheMaxAge,
                buster: 'query-cache-v1',
                /**
                 * Persist only while the vault is open.
                 *
                 * With encryption armed, a locked app writes nothing to disk. The
                 * dehydrated cache is then empty, which is exactly right -- a
                 * cache that is restored on the next launch would be a plaintext
                 * copy of private data sitting there having outlived the lock that
                 * was supposed to prevent it.
                 *
                 * The trade is that a locked app has no instant-load cache, so the
                 * first paint after unlocking is a round trip. That is the cost of
                 * not leaving a copy behind.
                 */
                dehydrateOptions: {
                    shouldDehydrateQuery: () => vaultOpenCheck(),
                },
            })
            stopPersistence = unsubscribe
            await restorePromise
        }

        const next = switchInFlight.then(run, run)
        switchInFlight = next.catch(() => undefined)
        await next
    }

    const { data } = await supabase.auth.getSession()
    await switchUser(data.session?.user.id ?? null)

    supabase.auth.onAuthStateChange((_event, session) => {
        void switchUser(session?.user.id ?? null)
    })
}
