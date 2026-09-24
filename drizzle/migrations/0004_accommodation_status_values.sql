ALTER TYPE public.accommodation_status ADD VALUE IF NOT EXISTS 'pending_review';
ALTER TYPE public.accommodation_status ADD VALUE IF NOT EXISTS 'active';
ALTER TYPE public.accommodation_status ADD VALUE IF NOT EXISTS 'paused';
CREATE TYPE public.accommodation_type AS ENUM ('villa','boutique_hotel','hotel','apartment','bnb','resort','unique_stay','other');