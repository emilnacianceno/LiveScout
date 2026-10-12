-- Canonical schema. Idempotent: safe to re-run. Changes to existing tables go in
-- database/updates/NNN-name.sql (also idempotent, applied once each, never edited after shipping).

CREATE TABLE IF NOT EXISTS public.facebook_group (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name character varying(255) NOT NULL,
    url character varying(500) NOT NULL UNIQUE,
    is_active boolean DEFAULT true NOT NULL,
    scrolls integer DEFAULT 30 NOT NULL CHECK (scrolls BETWEEN 1 AND 500),
    live_only boolean DEFAULT false NOT NULL,
    last_scraped_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS public.livestream (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id uuid NOT NULL REFERENCES public.facebook_group(id) ON DELETE CASCADE,
    video_id character varying(64) NOT NULL,
    url character varying(1000) NOT NULL,
    is_live boolean DEFAULT false NOT NULL,
    first_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    last_seen_at timestamp with time zone DEFAULT now() NOT NULL,
    UNIQUE (group_id, video_id)
);
CREATE INDEX IF NOT EXISTS idx_livestream_group_id ON public.livestream (group_id);
CREATE INDEX IF NOT EXISTS idx_livestream_first_seen_at ON public.livestream (first_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.scrape_run (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id uuid NOT NULL REFERENCES public.facebook_group(id) ON DELETE CASCADE,
    status character varying(20) DEFAULT 'running' NOT NULL CHECK (status IN ('running', 'done', 'failed')),
    found_count integer DEFAULT 0 NOT NULL,
    new_count integer DEFAULT 0 NOT NULL,
    error text,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    finished_at timestamp with time zone
);
CREATE INDEX IF NOT EXISTS idx_scrape_run_started_at ON public.scrape_run (started_at DESC);
