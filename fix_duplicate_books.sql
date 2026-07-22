-- ============================================
-- FIX DUPLICATE BOOK IDs FOR USER
-- ============================================
-- User ID: 7c32cbbe-3c14-4319-adda-cd82cd3e13c8
-- Run these queries in Supabase SQL Editor

-- Step 1: Find all duplicate IDs
SELECT 
    id, 
    COUNT(*) as duplicate_count, 
    array_agg(title) as book_titles, 
    array_agg(created_at) as created_dates
FROM public.books 
WHERE user_id = '7c32cbbe-3c14-4319-adda-cd82cd3e13c8'
GROUP BY id 
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;

-- Step 2: Fix duplicate IDs by assigning new UUIDs to duplicates
-- This keeps the oldest book (by created_at) and updates all others with new IDs
WITH duplicates AS (
    SELECT id, COUNT(*) as cnt
    FROM public.books
    WHERE user_id = '7c32cbbe-3c14-4319-adda-cd82cd3e13c8'
    GROUP BY id
    HAVING COUNT(*) > 1
),
oldest_duplicates AS (
    SELECT DISTINCT ON (id) ctid
    FROM public.books
    WHERE user_id = '7c32cbbe-3c14-4319-adda-cd82cd3e13c8'
      AND id IN (SELECT id FROM duplicates)
    ORDER BY id, created_at ASC
)
UPDATE public.books
SET id = gen_random_uuid()
WHERE user_id = '7c32cbbe-3c14-4319-adda-cd82cd3e13c8'
  AND id IN (SELECT id FROM duplicates)
  AND ctid NOT IN (SELECT ctid FROM oldest_duplicates);

-- Step 3: Verify the fix - should return 0 rows
SELECT id, COUNT(*) as count
FROM public.books
WHERE user_id = '7c32cbbe-3c14-4319-adda-cd82cd3e13c8'
GROUP BY id
HAVING COUNT(*) > 1;

-- Step 4: Verify total count - should show 2153
SELECT COUNT(*) as total_books
FROM public.books
WHERE user_id = '7c32cbbe-3c14-4319-adda-cd82cd3e13c8';