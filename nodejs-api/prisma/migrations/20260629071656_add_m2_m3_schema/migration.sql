-- AlterTable
ALTER TABLE "pages" ADD COLUMN     "analysis_error" TEXT,
ADD COLUMN     "analysis_status" VARCHAR(50) NOT NULL DEFAULT 'pending',
ADD COLUMN     "audience" TEXT[],
ADD COLUMN     "business_value" DECIMAL(3,2),
ADD COLUMN     "confidential_risk" DECIMAL(3,2),
ADD COLUMN     "content_type" VARCHAR(50),
ADD COLUMN     "duplicate_penalty" DECIMAL(3,2),
ADD COLUMN     "has_chart" BOOLEAN DEFAULT false,
ADD COLUMN     "has_stat" BOOLEAN DEFAULT false,
ADD COLUMN     "main_topic" VARCHAR(255),
ADD COLUMN     "pain_points" TEXT[],
ADD COLUMN     "post_potential_score" DECIMAL(3,2),
ADD COLUMN     "product_relevance" DECIMAL(3,2),
ADD COLUMN     "selected_for_post" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "template_fit" TEXT[],
ADD COLUMN     "text_density" DECIMAL(3,2),
ADD COLUMN     "uniqueness_score" DECIMAL(3,2),
ADD COLUMN     "visual_quality_score" DECIMAL(3,2);

-- CreateTable
CREATE TABLE "knowledge_graph_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "doc_id" UUID NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "knowledge_graph_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "page_analysis_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "doc_id" UUID NOT NULL,
    "status" VARCHAR(50) NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "page_analysis_jobs_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "knowledge_graph_jobs" ADD CONSTRAINT "knowledge_graph_jobs_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "page_analysis_jobs" ADD CONSTRAINT "page_analysis_jobs_doc_id_fkey" FOREIGN KEY ("doc_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
