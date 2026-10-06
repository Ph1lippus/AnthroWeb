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
 * Restores only the current user's cache and starts persistence for subsequent
 * query updates. Auth transitions clear the in-memory cache before switching
 * storage keys, preventing one user's data from being shown to another.
 */
export const initializeQueryPersistence = async (queryClient: QueryClient): Promise<void> => {
    let activePersister: Persister | null = null
    let stopPersistence: (() => void) | null = null
    let activeUserId: string | null = null

    const switchUser = async (userId: string | null): Promise<void> => {
        if (userId === activeUserId) return

        stopPersistence?.()
        stopPersistence = null
        if (activePersister) await activePersister.removeClient()
        activePersister = null
        queryClient.clear()
        activeUserId = userId

        if (!userId) return

        const persister = createPersister(userId)
        activePersister = persister
        const [unsubscribe, restorePromise] = persistQueryClient({
            queryClient,
            persister,
            maxAge: cacheMaxAge,
            buster: 'query-cache-v1',
        })
        stopPersistence = unsubscribe
        await restorePromise
    }

    const { data } = await supabase.auth.getSession()
    await switchUser(data.session?.user.id ?? null)

    supabase.auth.onAuthStateChange((_event, session) => {
        void switchUser(session?.user.id ?? null)
    })
}
