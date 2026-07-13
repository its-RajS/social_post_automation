CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "FeedbackIndexStatus" AS ENUM ('NOT_INDEXED', 'QUEUED', 'INDEXED', 'FAILED');
CREATE TYPE "PublicationFormat" AS ENUM ('SINGLE_IMAGE', 'PDF_DOCUMENT');
CREATE TYPE "PublicationState" AS ENUM ('PREPARING', 'READY', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'VERIFICATION_REQUIRED', 'CANCELLED');
CREATE TYPE "LinkedInDestinationType" AS ENUM ('MEMBER', 'ORGANIZATION');

ALTER TABLE "posts"
  ADD COLUMN "collection_date" DATE,
  ADD COLUMN "review_status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "reviewed_at" TIMESTAMPTZ,
  ADD COLUMN "feedback_index_status" "FeedbackIndexStatus" NOT NULL DEFAULT 'NOT_INDEXED';

UPDATE "posts"
SET "collection_date" = ("created_at" AT TIME ZONE 'Asia/Kolkata')::date
WHERE "collection_date" IS NULL;

ALTER TABLE "posts"
  ALTER COLUMN "collection_date" SET DEFAULT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Kolkata')::date),
  ALTER COLUMN "collection_date" SET NOT NULL;

CREATE TABLE "admin_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "token_hash" VARCHAR(64) NOT NULL,
  "csrf_token" VARCHAR(64) NOT NULL,
  "expires_at" TIMESTAMPTZ NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "admin_sessions_token_hash_key" ON "admin_sessions"("token_hash");

CREATE TABLE "linkedin_connections" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "member_urn" VARCHAR(255) NOT NULL,
  "display_name" VARCHAR(255),
  "access_token_encrypted" TEXT NOT NULL,
  "refresh_token_encrypted" TEXT,
  "access_token_expires_at" TIMESTAMPTZ NOT NULL,
  "refresh_token_expires_at" TIMESTAMPTZ,
  "scopes" TEXT[] NOT NULL,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "linkedin_connections_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "linkedin_connections_member_urn_key" ON "linkedin_connections"("member_urn");

CREATE TABLE "linkedin_destinations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "connection_id" UUID NOT NULL,
  "type" "LinkedInDestinationType" NOT NULL,
  "author_urn" VARCHAR(255) NOT NULL,
  "label" VARCHAR(255) NOT NULL,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  CONSTRAINT "linkedin_destinations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "linkedin_destinations_author_urn_key" ON "linkedin_destinations"("author_urn");
CREATE UNIQUE INDEX "linkedin_destinations_one_default_idx" ON "linkedin_destinations"(("is_default")) WHERE "is_default" = true;

CREATE TABLE "publications" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "destination_id" UUID NOT NULL,
  "collection_date" DATE NOT NULL,
  "format" "PublicationFormat" NOT NULL,
  "state" "PublicationState" NOT NULL DEFAULT 'PREPARING',
  "title" TEXT,
  "caption" TEXT,
  "hashtags" TEXT[] NOT NULL,
  "document_storage_path" TEXT,
  "linkedin_asset_urn" VARCHAR(255),
  "linkedin_post_urn" VARCHAR(255),
  "error_message" TEXT,
  "submission_started_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL,
  "published_at" TIMESTAMPTZ,
  CONSTRAINT "publications_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "publication_items" (
  "publication_id" UUID NOT NULL,
  "post_id" UUID NOT NULL,
  "position" INTEGER NOT NULL,
  CONSTRAINT "publication_items_pkey" PRIMARY KEY ("publication_id", "post_id")
);
CREATE UNIQUE INDEX "publication_items_publication_id_position_key" ON "publication_items"("publication_id", "position");

ALTER TABLE "linkedin_destinations" ADD CONSTRAINT "linkedin_destinations_connection_id_fkey"
  FOREIGN KEY ("connection_id") REFERENCES "linkedin_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "publications" ADD CONSTRAINT "publications_destination_id_fkey"
  FOREIGN KEY ("destination_id") REFERENCES "linkedin_destinations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "publication_items" ADD CONSTRAINT "publication_items_publication_id_fkey"
  FOREIGN KEY ("publication_id") REFERENCES "publications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "publication_items" ADD CONSTRAINT "publication_items_post_id_fkey"
  FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
