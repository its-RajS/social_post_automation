1. Product Vision
   We are building a LinkedIn Post Automation System that turns company documents into ready-to-publish LinkedIn posts with zero manual content creation from designers.
   The designer only reviews and approves. The system handles everything else: document parsing, page selection, post generation, image rendering, and multi-variant creation.
   Brand Colors (stored for all downstream UI modules):
   Primary: #cb2eba
   Secondary: #787496
   Accent: #d8bfd8
2. Full System Architecture
   plain
   ┌─────────────────────────────────────────────────────────────────────────────┐
   │ INPUTS │
   │ PDF | PPTX | DOCX | Images (PNG/JPG/WEBP/TIFF) | Website URLs | Past Posts │
   └─────────────────────────────────────┬───────────────────────────────────────┘
   │
   ▼
   ┌─────────────────────────────────────────────────────────────────────────────┐
   │ MODULE 1: DOCUMENT INGESTION & EXTRACTION ✅ COMPLETE │
   │ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ │
   │ │ Node.js │───►│ MinIO │───►│BullMQ/ │───►│ Python │───►│PostgreSQL│ │
   │ │ API │ │ Storage │ │ Redis │ │ Worker │ │ + Chroma │ │
   │ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ │
   │ Tools: Express, Multer, Prisma | Docling, pdf2image, LibreOffice, │
   │ Unstructured, sentence-transformers, Playwright │
   │ Output: Parsed pages with text, layout, screenshots, chunks, embeddings │
   └─────────────────────────────────────┬───────────────────────────────────────┘
   │
   ▼
   ┌─────────────────────────────────────────────────────────────────────────────┐
   │ MODULE 2: KNOWLEDGE GRAPH (Neo4j) 🔄 NEXT │
   │ • Extract entities: Company, Product, Service, Feature, Audience, │
   │ PainPoint, Benefit, UseCase, Industry, Document, Page, PostTheme, │
   │ BrandRule │
   │ • Relationships: OFFERS, SOLVES, AFFECTS, PROVIDES, MENTIONS, FITS, etc. │
   │ • Tools: Neo4j, LangChain LLMGraphTransformer, OpenAI/Claude │
   │ • Consumes: Module 1 pages + chunks │
   └─────────────────────────────────────┬───────────────────────────────────────┘
   │
   ▼
   ┌─────────────────────────────────────────────────────────────────────────────┐
   │ MODULE 3: PAGE ANALYSIS & SCORING 🔄 NEXT (parallel with Module 2) │
   │ • Analyze every page: topic, content_type, business_value, audience, │
   │ pain_points, visual_quality, text_density, has_chart, has_stat, │
   │ template_fit, confidential_risk │
   │ • Score formula: content + relevance + visual + template + uniqueness │
   │ - risk - duplicate - text_density │
   │ • Auto-reject: covers, TOCs, legal pages, dense text, confidential │
   │ • Auto-select top N pages (score > 0.7) │
   │ • Tools: FastAPI, OpenAI/Claude (structured output), OpenCV/Pillow │
   │ • Consumes: Module 1 pages + screenshots │
   │ • Optionally queries: Module 2 knowledge graph for context │
   └─────────────────────────────────────┬───────────────────────────────────────┘
   │
   ▼
   ┌─────────────────────────────────────────────────────────────────────────────┐
   │ MODULE 4: POST TYPE CLASSIFICATION ⏳ PENDING │
   │ • Map selected pages to post types: │
   │ - Document screenshot post │
   │ - Insight post │
   │ - Stat post │
   │ - Problem-solution post │
   │ - Product education post │
   │ - Case study post │
   │ - Quote post │
   │ - Carousel/document post │
   │ - Announcement post │
   │ • Rules: chart/stat → Stat post; workflow → Product education; │
   │ customer result → Case study; strong opinion → Insight post │
   │ • Consumes: Module 3 selected pages + scores │
   └─────────────────────────────────────┬───────────────────────────────────────┘
   │
   ▼
   ┌─────────────────────────────────────────────────────────────────────────────┐
   │ MODULE 5: TEMPLATE SELECTION & AI CONTENT GENERATION ⏳ PENDING │
   │ • Select template based on post type (doc_screenshot_left_text_right, │
   │ big_stat_center, problem_solution_split, quote_card, etc.) │
   │ • AI generates: title, subtitle, CTA, caption, hashtags │
   │ • Uses: page screenshot + page text + knowledge graph + vector DB │
   │ context + brand rules + past post style + template constraints │
   │ • Tools: OpenAI/Claude, Jinja2, Tailwind CSS │
   │ • Consumes: Module 3 selected pages + Module 2 knowledge graph │
   └─────────────────────────────────────┬───────────────────────────────────────┘
   │
   ▼
   ┌─────────────────────────────────────────────────────────────────────────────┐
   │ MODULE 6: TEMPLATE RENDERING ⏳ PENDING │
   │ • Fill template fields: title, subtitle, screenshot, CTA, logo │
   │ • Render HTML/CSS → PNG via Playwright │
   │ • Specs: 1200x627px (single image), 1080x1080px (carousel) │
   │ • Tools: Playwright, Jinja2, Tailwind CSS │
   │ • Consumes: Module 5 generated content │
   └─────────────────────────────────────┬───────────────────────────────────────┘
   │
   ▼
   ┌─────────────────────────────────────────────────────────────────────────────┐
   │ MODULE 7: MULTIPLE POST OPTIONS ⏳ PENDING │
   │ • Generate 3-4 variants per page: │
   │ - Different template │
   │ - Different hook/angle │
   │ - Different caption tone │
   │ - Different post type (if page supports multiple) │
   │ • Tools: Same as Module 5-6, with variant prompting │
   │ • Consumes: Module 6 rendered images │
   └─────────────────────────────────────┬───────────────────────────────────────┘
   │
   ▼
   ┌─────────────────────────────────────────────────────────────────────────────┐
   │ MODULE 8: DESIGNER APPROVAL DASHBOARD ⏳ PENDING │
   │ • React frontend showing: │
   │ - Final rendered image │
   │ - Caption + hashtags │
   │ - Source document/page │
   │ - Why this page was selected (score breakdown) │
   │ - Approve / Reject / Edit text / Download buttons │
   │ • Designer does NOT: select pages, choose screenshots, choose templates, │
   │ write content, crop images │
   │ • Tools: React, Tailwind CSS, FastAPI/Node.js API, SSE/WebSocket │
   │ • Consumes: Module 7 post options │
   └─────────────────────────────────────────────────────────────────────────────┘
   │
   ▼
   ┌─────────────────────────────────────────────────────────────────────────────┐
   │ OUTPUT: Approved LinkedIn posts → PostPeer API / LinkedIn API │
   └─────────────────────────────────────────────────────────────────────────────┘
3. Module Status
   Table
   Module Status Dependencies
4. Document Ingestion & Extraction ✅ COMPLETE None
5. Knowledge Graph (Neo4j) 🔄 BUILDING NOW Module 1
6. Page Analysis & Scoring 🔄 BUILDING NOW Module 1 (optionally Module 2)
7. Post Type Classification ⏳ PENDING Module 3
8. Template Selection & AI Content Generation ⏳ PENDING Module 3 + Module 2
9. Template Rendering ⏳ PENDING Module 5
10. Multiple Post Options ⏳ PENDING Module 6
11. Designer Approval Dashboard ⏳ PENDING Module 7
12. Infrastructure (Shared Across All Modules)
    Table
    Service Tool Port Purpose
    API Gateway Node.js Express 3000 Upload, status, webhooks, dashboard API
    Document Worker Python FastAPI 8001 Docling parsing, screenshots, chunking
    Knowledge Graph Python FastAPI 8002 Neo4j graph construction, queries
    Page Analysis Python FastAPI 8003 Scoring, selection, visual analysis
    PostgreSQL postgres:15-alpine 5432 All metadata, pages, chunks, scores
    Redis redis:7-alpine 6379 BullMQ job queue, caching
    MinIO minio/minio 9000/9001 File storage (raw + screenshots)
    Chroma chromadb/chroma 8000 Vector embeddings
    Neo4j neo4j:5-community 7474/7687 Knowledge graph
13. Database Schema (Module 1 — Already Built)
    documents
    sql
    CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    file_size_bytes BIGINT,
    storage_path VARCHAR(500) NOT NULL,
    status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    total_pages INTEGER,
    chunks_count INTEGER,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processing_started_at TIMESTAMP WITH TIME ZONE,
    processing_completed_at TIMESTAMP WITH TIME ZONE
    );
    pages
    sql
    CREATE TABLE pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    text_content TEXT,
    ocr_text TEXT,
    screenshot_url VARCHAR(500),
    layout_json JSONB,
    has_tables BOOLEAN DEFAULT FALSE,
    has_images BOOLEAN DEFAULT FALSE,
    has_charts BOOLEAN DEFAULT FALSE,
    word_count INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(doc_id, page_number)
    );
    chunks
    sql
    CREATE TABLE chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    chunk_type VARCHAR(50) NOT NULL CHECK (chunk_type IN ('Title', 'NarrativeText', 'ListItem', 'Table', 'Header', 'Footer', 'ImageCaption')),
    text TEXT NOT NULL,
    bounding_box JSONB,
    embedding_model VARCHAR(100),
    vector_db_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
    processing_jobs
    sql
    CREATE TABLE processing_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    queue_job_id VARCHAR(255),
    worker_id VARCHAR(255),
    status VARCHAR(50) NOT NULL CHECK (status IN ('queued', 'processing', 'completed', 'failed', 'retrying')),
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    error_stack TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );
14. Module 2: Knowledge Graph — Build Specification
    What to Build
    A Python FastAPI service that reads processed documents from Module 1 and constructs a Neo4j knowledge graph representing company understanding.
    Graph Schema
    Nodes
    Table
    Label Properties
    Company name, industry, description
    Product name, category, description
    Service name, description
    Feature name, description
    Audience name, role, department
    PainPoint name, description, severity
    Benefit name, description, metric
    UseCase name, description, industry
    Industry name, description
    Document doc_id, filename, mime_type, uploaded_at
    Page page_id, page_number, text_preview, screenshot_url
    PostTheme name, description, template_types
    BrandRule rule_type, description, priority
    Relationships
    Table
    Type From → To
    OFFERS Company → Product/Service
    HAS_FEATURE Product → Feature
    SOLVES Product → PainPoint
    AFFECTS PainPoint → Audience
    PROVIDES Product → Benefit
    HAS_USE_CASE Product → UseCase
    TARGETS Product → Audience
    SERVES Company → Industry
    MENTIONS Page → Product/PainPoint/Benefit
    RELATES_TO Page → PostTheme
    FITS Page → PostTheme
    RESTRICTS BrandRule → Claim
    BELONGS_TO Page → Document
    CONTAINS Document → Page
    Tech Stack
    Table
    Component Tool
    Graph DB Neo4j (Aura or self-hosted)
    LLM OpenAI GPT-4o or Claude 3.5 Sonnet
    Framework FastAPI
    Neo4j Client neo4j-python-driver
    LLM Framework LangChain (LLMGraphTransformer)
    Vector Store Chroma (existing)
    API Endpoints
    Table
    Method Path Purpose
    POST /api/v2/graph/build Start graph construction for a doc
    GET /api/v2/graph/status/:job_id Check build status
    GET /api/v2/graph/entities/:doc_id Get all entities for a document
    GET /api/v2/graph/context/:page_id Get graph context for a page
    Data Flow
    Receive doc_id via API
    Fetch all pages + chunks for that doc from PostgreSQL
    Assemble context (prioritize Title + NarrativeText chunks)
    Send to LLM with structured extraction prompt
    Extract entities + relationships as JSON
    Create nodes via MERGE (idempotent)
    Create relationships via MERGE
    Link each Page node to parent Document and mentioned entities
    Seed PostTheme and BrandRule nodes
    Return completion via webhook
    Docker Addition
    yaml
    neo4j:
    image: neo4j:5-community
    environment: - NEO4J_AUTH=neo4j/password123 - NEO4J_PLUGINS=["apoc", "gds"]
    volumes: - neo4j_data:/data
    ports: - "7474:7474" - "7687:7687"
15. Module 3: Page Analysis & Scoring — Build Specification
    What to Build
    A Python FastAPI service that analyzes every page from Module 1 and produces a post*potential_score to auto-select the best pages for LinkedIn posts.
    Analysis Dimensions
    Table
    Dimension Type Source
    main_topic string LLM extraction
    content_type enum LLM classification
    business_value float 0-1 LLM + heuristics
    audience string[] LLM + Module 2
    pain_points string[] LLM + Module 2
    product_relevance float 0-1 LLM or Module 2
    visual_quality_score float 0-1 OpenCV/Pillow
    text_density float 0-1 OpenCV/Pillow
    has_chart boolean OpenCV contour detection
    has_table boolean Module 1 layout_json
    has_stat boolean Regex + LLM
    template_fit string[] LLM
    confidential_risk float 0-1 LLM + keyword detection
    post_potential_score float 0-1 Composite formula
    Scoring Formula (MANDATORY)
    plain
    Final Score =
    (content_value * 0.20) +
    (company*relevance * 0.20) +
    (visual*quality_score * 0.15) +
    (template*fit_score * 0.15) +
    (uniqueness*score * 0.10) -
    (risk*score * 0.10) -
    (duplicate*penalty * 0.05) -
    (text*density_penalty * 0.05)

Where:
content_value = business_value + (has_stat ? 0.1 : 0) + (has_chart ? 0.1 : 0)
company_relevance = product_relevance
template_fit_score = count(matching_templates) / total_templates
uniqueness_score = 1 - max_similarity_to_other_pages
risk_score = confidential_risk
duplicate_penalty = similarity > 0.95 ? 0.5 : 0
text_density_penalty = text_density > 0.8 ? (text_density - 0.8) \* 2.5 : 0
Auto-Rejection Rules
Page score = 0 if ANY of:
Page 1 + <100 words + no tables/charts (cover page)
Contains "Table of Contents", "Contents", "Index"
Contains "Disclaimer", "Legal Notice", "Confidential", "©"
Text density > 0.95
Confidential risk > 0.7
Visual quality < 0.3
Duplicate similarity > 0.95
Tech Stack
Table
Component Tool
Framework FastAPI
LLM OpenAI GPT-4o or Claude 3.5 Sonnet (structured output)
Image Analysis OpenCV + Pillow
Vector DB Chroma (existing)
DB PostgreSQL (existing)
Optional Neo4j (Module 2 for context)
API Endpoints
Table
Method Path Purpose
POST /api/v3/pages/analyze Start analysis for a doc
GET /api/v3/pages/analyze/status/:job_id Check analysis status
GET /api/v3/pages/:doc_id Get all pages with scores
GET /api/v3/pages/:doc_id/selected Get auto-selected pages (score > 0.7)
Data Flow
Receive doc_id via API
Fetch all pages from pages table where post_potential_score IS NULL
For each page:
a. Content analysis: Send text to LLM, get structured JSON (topic, type, audience, pain points, relevance, template fit, risk)
b. Visual analysis: Load screenshot, compute sharpness (Laplacian), contrast (std), text density (white pixel ratio), chart detection (contours)
c. Uniqueness: Compare embedding against other pages in same doc via Chroma
d. Apply formula: Calculate composite score
e. Apply rejection rules: Zero out rejected pages
Update pages table with all scores
Mark top N pages as selected_for_post = true (score > 0.7, limit 5 per doc)
Return completion via webhook
Database Additions
sql
ALTER TABLE pages ADD COLUMN IF NOT EXISTS
main_topic VARCHAR(255),
content_type VARCHAR(50),
business_value DECIMAL(3,2),
audience TEXT[],
pain_points TEXT[],
product_relevance DECIMAL(3,2),
visual_quality_score DECIMAL(3,2),
text_density DECIMAL(3,2),
has_chart BOOLEAN DEFAULT FALSE,
has_stat BOOLEAN DEFAULT FALSE,
template_fit TEXT[],
confidential_risk DECIMAL(3,2),
post_potential_score DECIMAL(3,2),
uniqueness_score DECIMAL(3,2),
duplicate_penalty DECIMAL(3,2),
analysis_status VARCHAR(50) DEFAULT 'pending' CHECK (analysis_status IN ('pending', 'analyzing', 'analyzed', 'failed')),
selected_for_post BOOLEAN DEFAULT FALSE,
analysis_error TEXT;

8. Integration Points
   Module 2 ↔ Module 1
   Reads: documents, pages, chunks tables from PostgreSQL
   Reads: Chunk embeddings from Chroma
   Writes: Neo4j graph (nodes + relationships)
   Writes: knowledge_graph_jobs table in PostgreSQL
   Module 3 ↔ Module 1
   Reads: pages table (text_content, screenshot_url, layout_json)
   Reads: Chunk embeddings from Chroma (uniqueness check)
   Writes: Scores back to pages table
   Module 3 ↔ Module 2 (Optional)
   Queries: GET /api/v2/graph/context/:page_id for:
   product_relevance (how many products mentioned)
   audience (connected to pain points)
   content_type (graph-suggested themes)
   If Module 2 is not ready, Module 3 falls back to LLM inference

9. Constraints (All Modules)
   Docling is Python-only. Never attempt to run it in Node.js.
   Python workers must be idempotent. doc_id + page_number are unique constraints.
   All timestamps ISO 8601 with timezone (UTC).
   Max file size: 100MB (Module 1).
   Batch LLM calls: 5 pages at a time (Module 2), 10 pages at a time (Module 3).
   Retry logic: 3 attempts with exponential backoff.
   Screenshots must be accessible via presigned URL for downstream dashboard.
   Webhook secret verification on all Python → Node.js callbacks.

10. gstack Workflow
    Save this file as CLAUDE.md in project root
    Run /office-hours or /spec to align on product wedge
    Run /plan-eng-review to lock architecture
    Build Module 2 and Module 3 using /codex
    Run /review for staff engineer pass
    Run /qa to validate:
    Module 2: Upload doc → query Neo4j → verify entities exist
    Module 3: Upload doc → verify scores populated → verify top pages selected
    `
