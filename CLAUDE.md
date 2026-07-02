# CLAUDE.md — LinkedIn Post Automation System

## Master Project Brief for Plan Mode

## Last Updated: 2026-06-30

---

## 1. Product Vision

We are building a **LinkedIn Post Automation System** that turns company documents into ready-to-publish LinkedIn posts with zero manual content creation from designers.

**The designer only reviews and approves.** The system handles everything else: document parsing, page selection, post generation, image rendering, and multi-variant creation.

**Brand Colors** (stored for all downstream UI modules):

- Primary: `#cb2eba`
- Secondary: `#787496`
- Accent: `#d8bfd8`

**Reference Template**: Nuix-style case study hero (blue background, bold stacked headline, cyan subtitle, pill CTA, tilted document screenshot, bottom-left logo). Our system must generate this and similar templates via HTML/CSS + Playwright.

---

## 2. Full System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              INPUTS                                           │
│  PDF | PPTX | DOCX | Images | Website URLs | Past Posts | Brand Guidelines  │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  MODULE 1: DOCUMENT INGESTION & EXTRACTION  ✅ COMPLETE                       │
│  Node.js API → MinIO → BullMQ/Redis → Python Worker (Docling) → PostgreSQL   │
│  + Chroma (embeddings) + Screenshots                                        │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  MODULE 2: KNOWLEDGE GRAPH (Neo4j)  ✅ COMPLETE                               │
│  Nodes: Company, Product, Service, Feature, Audience, PainPoint, Benefit,    │
│  UseCase, Industry, Document, Page, PostTheme, BrandRule                     │
│  Relationships: OFFERS, SOLVES, AFFECTS, PROVIDES, MENTIONS, FITS, etc.    │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  MODULE 3: PAGE ANALYSIS & SCORING  ✅ COMPLETE (WITH FIX)                   │
│  • Analyzes every page: topic, content_type, business_value, audience,      │
│    pain_points, visual_quality, text_density, has_chart, has_stat,         │
│    template_fit, confidential_risk                                          │
│  • SCORING FORMULA (UPDATED):                                               │
│    base = (content_value*0.25 + relevance*0.20 + visual*0.15 +             │
│            template_fit*0.15 + uniqueness*0.10 + stat_bonus +               │
│            chart_bonus + table_bonus) * type_multiplier                       │
│    penalties = (risk*0.15 + duplicate*0.10 + text_density*0.05)            │
│    final = max(0, min(1, base - penalties))                                 │
│  • type_multiplier: stat=1.15, insight=1.10, workflow=1.10,                 │
│    product_education=1.10, case_study=1.15, other=0.90                       │
│  • SELECTION THRESHOLD: 0.35 (was 0.7 — too aggressive for docs)            │
│  • Auto-reject: covers, TOCs, legal pages, text_density>0.95, risk>0.5     │
│  • Auto-select top 5 pages per doc where score > 0.35                       │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  MODULE 4: POST TYPE CLASSIFICATION  ✅ COMPLETE (PASS-THROUGH)              │
│  Maps Module 3 content_type → template_fit array → single recommended      │
│  template. No LLM needed — lookup table.                                    │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  MODULE 5: AI CONTENT GENERATION  🔄 BUILDING NOW                             │
│  Generates: title, subtitle, CTA, caption, hashtags, hook_angle, tone        │
│  Uses: selected page + KG context + vector DB (past posts) + brand rules   │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  MODULE 6: TEMPLATE RENDERING  🔄 BUILDING NOW (COUPLED WITH MODULE 5)        │
│  HTML/CSS template + Playwright → PNG (1200x627 or 1080x1080)               │
│  Templates: case_study_hero, big_stat_center, problem_solution_split, etc.   │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  MODULE 7: MULTIPLE POST OPTIONS  ⏳ PENDING                                   │
│  3-4 variants per page: different hook, template, angle, tone              │
└─────────────────────────────────────┬───────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  MODULE 8: DESIGNER APPROVAL DASHBOARD  ⏳ PENDING                           │
│  React frontend: final image, caption, source, why selected, approve/reject  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Module Status

| Module                      | Status           | Notes                                                 |
| --------------------------- | ---------------- | ----------------------------------------------------- |
| 1. Document Ingestion       | ✅ COMPLETE      | Docling, screenshots, chunks, embeddings              |
| 2. Knowledge Graph          | ✅ COMPLETE      | Neo4j with all entity types and relationships         |
| 3. Page Analysis            | ✅ COMPLETE      | **Threshold lowered to 0.35**. type_multiplier added. |
| 4. Post Type Classification | ✅ COMPLETE      | Lookup table from content_type → template             |
| 5. AI Content Generation    | 🔄 **BUILD NOW** | LLM-powered content creation                          |
| 6. Template Rendering       | 🔄 **BUILD NOW** | HTML/CSS → PNG via Playwright                         |
| 7. Multiple Options         | ⏳ PENDING       | Variant generation                                    |
| 8. Designer Dashboard       | ⏳ PENDING       | React approval UI                                     |

---

## 4. Infrastructure (Shared)

| Service             | Tool               | Port      | Purpose                                 |
| ------------------- | ------------------ | --------- | --------------------------------------- |
| API Gateway         | Node.js Express    | 3000      | Upload, status, webhooks, dashboard API |
| Document Worker     | Python FastAPI     | 8001      | Docling parsing                         |
| KG Service          | Python FastAPI     | 8002      | Neo4j graph queries                     |
| Analysis Service    | Python FastAPI     | 8003      | Page scoring                            |
| **Content Service** | **Python FastAPI** | **8004**  | **Module 5 — AI content generation**    |
| **Render Service**  | **Python FastAPI** | **8005**  | **Module 6 — Playwright rendering**     |
| PostgreSQL          | postgres:15-alpine | 5432      | All metadata                            |
| Redis               | redis:7-alpine     | 6379      | BullMQ, cache                           |
| MinIO               | minio/minio        | 9000/9001 | File storage                            |
| Chroma              | chromadb/chroma    | 8000      | Vector embeddings                       |
| Neo4j               | neo4j:5-community  | 7474/7687 | Knowledge graph                         |

---

## 5. Database Schema (Module 1-3 Already Built)

### `documents`

```sql
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
```

### `pages` (WITH MODULE 3 SCORING COLUMNS)

```sql
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
    has_stat BOOLEAN DEFAULT FALSE,
    word_count INTEGER,

    -- MODULE 3 ANALYSIS COLUMNS
    main_topic VARCHAR(255),
    content_type VARCHAR(50),
    business_value DECIMAL(3,2),
    audience TEXT[],
    pain_points TEXT[],
    product_relevance DECIMAL(3,2),
    visual_quality_score DECIMAL(3,2),
    text_density DECIMAL(3,2),
    template_fit TEXT[],
    confidential_risk DECIMAL(3,2),
    post_potential_score DECIMAL(3,2),
    uniqueness_score DECIMAL(3,2),
    duplicate_penalty DECIMAL(3,2),
    analysis_status VARCHAR(50) DEFAULT 'pending' CHECK (analysis_status IN ('pending', 'analyzing', 'analyzed', 'failed')),
    selected_for_post BOOLEAN DEFAULT FALSE,
    analysis_error TEXT,

    -- MODULE 4 CLASSIFICATION
    recommended_template VARCHAR(100),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(doc_id, page_number)
);
```

### `chunks`

```sql
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
```

### `knowledge_graph_jobs`

```sql
CREATE TABLE knowledge_graph_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    doc_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    entities_created INTEGER DEFAULT 0,
    relationships_created INTEGER DEFAULT 0,
    pages_linked INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);
```

---

## 6. Module 4: Post Type Classification (✅ COMPLETE — VERIFY)

### What It Does

Module 4 is a **classification pass-through**. It takes Module 3's `content_type` and maps it to:

1. A primary `recommended_template`
2. A ranked `template_fit` array

### Classification Rules (LOOKUP TABLE — NO LLM)

| `content_type`      | `recommended_template`           | `template_fit` (ranked)                                                                      |
| ------------------- | -------------------------------- | -------------------------------------------------------------------------------------------- |
| `stat`              | `big_stat_center`                | `["big_stat_center", "stat_card", "doc_screenshot_left_text_right"]`                         |
| `insight`           | `big_insight`                    | `["big_insight", "quote_card", "doc_screenshot_left_text_right"]`                            |
| `problem_solution`  | `problem_solution_split`         | `["problem_solution_split", "doc_screenshot_left_text_right", "big_insight"]`                |
| `product_education` | `product_feature_highlight`      | `["product_feature_highlight", "doc_screenshot_left_text_right", "case_study_before_after"]` |
| `case_study`        | `case_study_hero`                | `["case_study_hero", "case_study_before_after", "doc_screenshot_left_text_right"]`           |
| `workflow`          | `product_feature_highlight`      | `["product_feature_highlight", "doc_screenshot_left_text_right", "carousel_cover_page"]`     |
| `quote`             | `quote_card`                     | `["quote_card", "big_insight"]`                                                              |
| `announcement`      | `announcement_card`              | `["announcement_card", "doc_screenshot_left_text_right"]`                                    |
| `other`             | `doc_screenshot_left_text_right` | `["doc_screenshot_left_text_right"]`                                                         |

### Implementation

This runs automatically after Module 3 completes. Update the `pages` table:

```sql
UPDATE pages
SET recommended_template = CASE content_type
    WHEN 'stat' THEN 'big_stat_center'
    WHEN 'insight' THEN 'big_insight'
    WHEN 'problem_solution' THEN 'problem_solution_split'
    WHEN 'product_education' THEN 'product_feature_highlight'
    WHEN 'case_study' THEN 'case_study_hero'
    WHEN 'workflow' THEN 'product_feature_highlight'
    WHEN 'quote' THEN 'quote_card'
    WHEN 'announcement' THEN 'announcement_card'
    ELSE 'doc_screenshot_left_text_right'
END
WHERE selected_for_post = true;
```

### Verification Checklist

- [ ] `recommended_template` column exists in `pages` table
- [ ] Classification runs automatically after Module 3 marks `selected_for_post = true`
- [ ] All `content_type` values from Module 3 have a mapping
- [ ] `template_fit` array is preserved from Module 3 (do not overwrite)

**If any of the above is missing, build it now as part of this module.**

---

## 7. Module 5: AI Content Generation (🔄 BUILD THIS)

### What to Build

A Python FastAPI service that generates LinkedIn post content (title, subtitle, CTA, caption, hashtags) for each selected page.

### Architecture

```
Module 5 Input Assembly:
    │
    ├──► Selected page from PostgreSQL (pages.selected_for_post = true)
    │      • main_topic, content_type, audience, pain_points
    │      • has_stat, has_chart, recommended_template
    │
    ├──► Knowledge Graph context (Neo4j)
    │      • GET /api/v2/graph/context/:page_id
    │      • mentioned_products, mentioned_pain_points
    │      • related_benefits, target_audiences, company_context
    │
    ├──► Similar past posts (Chroma Vector DB)
    │      • semantic search: "posts similar to {page.main_topic}"
    │      • retrieve: caption style, hook pattern, tone
    │
    ├──► Brand rules (Neo4j BrandRule nodes)
    │      • RESTRICTS claims (e.g., "avoid 100% accuracy claims")
    │      • REQUIRED phrases (e.g., "always mention ROI")
    │
    └──► Template constraints (Module 4 recommended_template)
           • text length limits, field requirements
           • tone guidance per template
```

### Tech Stack

| Component         | Tool                                       | Purpose                 |
| ----------------- | ------------------------------------------ | ----------------------- |
| Framework         | **FastAPI**                                | Service API             |
| LLM               | **OpenAI GPT-4o** or **Claude 3.5 Sonnet** | Content generation      |
| Structured Output | **Instructor** or **OpenAI JSON mode**     | Guaranteed schema       |
| Vector DB         | **Chroma** (existing)                      | Past post retrieval     |
| Graph DB          | **Neo4j** (existing)                       | Entity context          |
| DB                | **PostgreSQL** (existing)                  | Read pages, write posts |

### Output Schema (MANDATORY)

```json
{
  "post_id": "post_abc123",
  "page_id": "page_7f3a9b2c",
  "doc_id": "doc_2f8a9b1c",
  "status": "generated",

  "content": {
    "title": "12 Hours a Week on Invoice Review Is 12 Hours Not Spent on Strategy",
    "subtitle": "How finance teams are reclaiming their calendars with automation",
    "cta": "See the full breakdown",
    "caption": "Finance teams spend an average of 12 hours per week on manual invoice review...",
    "hashtags": [
      "#FinanceAutomation",
      "#InvoiceProcessing",
      "#WorkflowOptimization"
    ],
    "hook_angle": "pain_point_first",
    "tone": "authoritative_empathetic"
  },

  "template": {
    "template_id": "problem_solution_split",
    "recommended_by": "module_4",
    "fields_used": {
      "title": "12 Hours a Week...",
      "subtitle": "How finance teams...",
      "cta": "See the full breakdown",
      "screenshot": "screenshots/doc_2f8a9b1c/page_4.png",
      "logo": "brand/logo_white.png"
    }
  },

  "context": {
    "main_topic": "Invoice approval delays",
    "content_type": "problem_solution",
    "audience": ["finance teams", "CFOs"],
    "pain_points": ["manual review", "approval bottlenecks"],
    "products_mentioned": ["Invoice Automation Platform"],
    "benefits_highlighted": ["faster approvals", "12 hours saved weekly"],
    "source_text_preview": "Finance teams spend an average of 12 hours...",
    "why_this_page": "Selected for high post potential (0.88). Contains verified stat, strong problem-solution structure, and chart visual."
  },

  "brand_compliance": {
    "rules_checked": ["avoid_100_percent_claims", "mention_roi"],
    "violations": [],
    "required_phrases_included": ["ROI"]
  },

  "created_at": "2026-06-30T15:00:00Z"
}
```

### LLM Prompt Template (System Prompt)

```
You are a senior LinkedIn content strategist for a B2B SaaS company.
Your task is to generate a LinkedIn post based on a company document page.

BRAND VOICE:
- Confident but not arrogant
- Empathetic to customer pain points
- Data-backed but conversational
- Never use hyperbole like "revolutionary" or "game-changing"
- Primary color: #cb2eba, Secondary: #787496, Accent: #d8bfd8

INPUT CONTEXT:
- Page Topic: {main_topic}
- Content Type: {content_type}
- Target Audience: {audience}
- Pain Points: {pain_points}
- Products: {products_mentioned}
- Benefits: {benefits_highlighted}
- Has Stat: {has_stat}
- Has Chart: {has_chart}
- Recommended Template: {recommended_template}

SIMILAR PAST POSTS (for style reference):
{past_posts_context}

BRAND RULES:
{brand_rules}

TEMPLATE CONSTRAINTS:
- Template: {recommended_template}
- Title max length: {title_max_chars}
- Subtitle max length: {subtitle_max_chars}
- CTA max length: {cta_max_chars}
- Caption: 150-300 words, 2-4 paragraphs
- Hashtags: 3-5 tags, mix of broad and niche

OUTPUT FORMAT (JSON):
{
  "title": "string",
  "subtitle": "string",
  "cta": "string",
  "caption": "string",
  "hashtags": ["string"],
  "hook_angle": "pain_point_first | stat_first | question_first | story_first | insight_first",
  "tone": "authoritative_empathetic | casual | provocative | educational"
}

RULES:
1. If has_stat is true, lead with the stat in the caption or title
2. If content_type is "case_study", include a customer outcome
3. If content_type is "problem_solution", state the problem in first sentence
4. Never claim "100%" or "guaranteed" — brand rule restriction
5. Always include at least one benefit from the benefits_highlighted list
6. Caption should ask a question in the final paragraph to drive engagement
7. Hashtags must include one company-branded tag if applicable
```

### API Endpoints

#### `POST /api/v5/posts/generate`

**Request**:

```json
{
  "doc_id": "doc_2f8a9b1c",
  "page_id": "page_7f3a9b2c",
  "options": {
    "tone": "authoritative_empathetic",
    "hook_angle": "auto",
    "include_stat_lead": true
  }
}
```

**Response** `202 Accepted`:

```json
{
  "job_id": "gen_job_xyz789",
  "page_id": "page_7f3a9b2c",
  "status": "processing",
  "estimated_seconds": 15
}
```

#### `GET /api/v5/posts/status/:job_id`

**Response**:

```json
{
  "job_id": "gen_job_xyz789",
  "status": "completed",
  "post": {
    /* full post schema above */
  }
}
```

#### `GET /api/v5/posts/:doc_id`

**Response**: All generated posts for a document.

#### `POST /api/v5/posts/:post_id/regenerate`

**Request**:

```json
{
  "variation": "different_hook",
  "tone": "casual"
}
```

Regenerates a single field or full post with different parameters.

### Database Schema: `posts`

```sql
CREATE TABLE posts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
    doc_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'generating', 'completed', 'failed')),

    -- Content fields
    title TEXT NOT NULL,
    subtitle TEXT,
    cta TEXT,
    caption TEXT NOT NULL,
    hashtags TEXT[],
    hook_angle VARCHAR(50),
    tone VARCHAR(50),

    -- Template
    template_id VARCHAR(100),
    template_fields JSONB,

    -- Context (stored for transparency)
    context JSONB,
    brand_compliance JSONB,

    -- Variation tracking
    variation_of UUID REFERENCES posts(id),
    variation_type VARCHAR(50), -- "different_hook", "different_tone", "different_template"

    -- Status
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

---

## 8. Module 6: Template Rendering (🔄 BUILD THIS — COUPLED WITH MODULE 5)

### What to Build

A Python FastAPI service that takes Module 5's generated content + a page screenshot and renders a final PNG image using HTML/CSS + Playwright.

### Architecture

```
Module 6 Input:
    │
    ├──► Template HTML (Jinja2) with CSS
    ├──► Content fields from Module 5 (title, subtitle, CTA)
    ├──► Screenshot URL from MinIO (page screenshot)
    ├──► Logo URL from MinIO (brand asset)
    └──► Brand colors (primary, secondary, accent)
            │
            ▼
    ┌────────────────────────────┐
    │  Jinja2 Template Engine    │
    │  Injects vars into HTML    │
    └────────────────────────────┘
            │
            ▼
    ┌────────────────────────────┐
    │  Playwright (Chromium)     │
    │  Renders HTML → PNG        │
    │  Viewport: 1200x627        │
    └────────────────────────────┘
            │
            ▼
    ┌────────────────────────────┐
    │  MinIO Upload              │
    │  posts/{post_id}/final.png │
    └────────────────────────────┘
```

### Tech Stack

| Component        | Tool                                                |
| ---------------- | --------------------------------------------------- |
| Framework        | **FastAPI**                                         |
| Templating       | **Jinja2**                                          |
| CSS Framework    | **Tailwind CSS** (via CDN in HTML) or inline styles |
| Rendering        | **Playwright** (`playwright==1.48.0`)               |
| Image Processing | **Pillow** (resize, composite if needed)            |
| Storage          | **boto3** → MinIO                                   |

### Template Definitions

Templates are HTML files with Jinja2 variables. Store in `templates/` folder.

#### Template: `case_study_hero.html`

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap"
      rel="stylesheet"
    />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }

      body {
        width: 1200px;
        height: 627px;
        background: {{ background_color | default('#0052CC') }};
        font-family: 'Inter', sans-serif;
        overflow: hidden;
        position: relative;
      }

      .container {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 80px;
      }

      .content { max-width: 600px; }

      .headline {
        font-size: 68px;
        font-weight: 800;
        color: #FFFFFF;
        text-transform: uppercase;
        line-height: 1.05;
        letter-spacing: -2px;
      }

      .subheadline {
        font-size: 26px;
        font-weight: 400;
        color: {{ accent_color | default('#00D4AA') }};
        margin-top: 24px;
        line-height: 1.3;
      }

      .cta-button {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        margin-top: 40px;
        padding: 16px 36px;
        border: 2px solid {{ accent_color | default('#00D4AA') }};
        border-radius: 50px;
        color: #FFFFFF;
        font-size: 16px;
        font-weight: 600;
        text-decoration: none;
        background: transparent;
        letter-spacing: 0.5px;
      }

      .cta-button::after {
        content: "›";
        font-size: 22px;
        margin-left: 4px;
      }

      .logo {
        position: absolute;
        bottom: 60px;
        left: 80px;
      }

      .logo img {
        width: 140px;
        height: auto;
      }

      .screenshot-mockup {
        position: absolute;
        bottom: 40px;
        right: 80px;
        width: 460px;
        transform: perspective(900px) rotateY(-14deg) rotateX(4deg);
        box-shadow: 0 30px 60px rgba(0,0,0,0.35);
        border-radius: 6px;
        overflow: hidden;
        background: white;
      }

      .screenshot-mockup img {
        width: 100%;
        height: auto;
        display: block;
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="content">
        <div class="headline">{{ title }}</div>
        <div class="subheadline">{{ subtitle }}</div>
        <a class="cta-button">{{ cta }}</a>
      </div>
    </div>

    <div class="logo">
      <img src="{{ logo_url }}" alt="Logo" />
    </div>

    <div class="screenshot-mockup">
      <img src="{{ screenshot_url }}" alt="Document preview" />
    </div>
  </body>
</html>
```

#### Template: `big_stat_center.html`

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap"
      rel="stylesheet"
    />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }

      body {
        width: 1200px;
        height: 627px;
        background: {{ background_color | default('#0a0a0a') }};
        font-family: 'Inter', sans-serif;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: 80px;
        position: relative;
        overflow: hidden;
      }

      .stat-number {
        font-size: 140px;
        font-weight: 800;
        color: {{ primary_color | default('#cb2eba') }};
        line-height: 1;
        letter-spacing: -4px;
      }

      .stat-label {
        font-size: 32px;
        font-weight: 600;
        color: #FFFFFF;
        margin-top: 16px;
        max-width: 800px;
        line-height: 1.3;
      }

      .stat-context {
        font-size: 20px;
        font-weight: 400;
        color: {{ secondary_color | default('#787496') }};
        margin-top: 24px;
        max-width: 700px;
        line-height: 1.4;
      }

      .logo {
        position: absolute;
        bottom: 40px;
        left: 50%;
        transform: translateX(-50%);
      }

      .logo img {
        width: 120px;
        height: auto;
        opacity: 0.8;
      }

      .source-tag {
        position: absolute;
        top: 40px;
        right: 40px;
        font-size: 12px;
        color: {{ secondary_color | default('#787496') }};
        text-transform: uppercase;
        letter-spacing: 1px;
      }
    </style>
  </head>
  <body>
    <div class="source-tag">{{ source_label | default('Research') }}</div>
    <div class="stat-number">{{ stat_value }}</div>
    <div class="stat-label">{{ stat_label }}</div>
    <div class="stat-context">{{ subtitle }}</div>
    <div class="logo">
      <img src="{{ logo_url }}" alt="Logo" />
    </div>
  </body>
</html>
```

#### Template: `problem_solution_split.html`

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap"
      rel="stylesheet"
    />
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }

      body {
        width: 1200px;
        height: 627px;
        background: #ffffff;
        font-family: 'Inter', sans-serif;
        display: flex;
        overflow: hidden;
      }

      .left-panel {
        width: 50%;
        background: {{ primary_color | default('#cb2eba') }};
        padding: 80px 60px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        color: white;
      }

      .problem-label {
        font-size: 14px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 2px;
        opacity: 0.8;
        margin-bottom: 20px;
      }

      .left-title {
        font-size: 36px;
        font-weight: 700;
        line-height: 1.2;
        margin-bottom: 20px;
      }

      .left-body {
        font-size: 18px;
        line-height: 1.5;
        opacity: 0.9;
      }

      .right-panel {
        width: 50%;
        padding: 80px 60px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        background: #f8f9fa;
      }

      .solution-label {
        font-size: 14px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 2px;
        color: {{ primary_color | default('#cb2eba') }};
        margin-bottom: 20px;
      }

      .right-title {
        font-size: 36px;
        font-weight: 700;
        line-height: 1.2;
        color: #1a1a1a;
        margin-bottom: 20px;
      }

      .right-body {
        font-size: 18px;
        line-height: 1.5;
        color: #4a4a4a;
      }

      .logo {
        position: absolute;
        bottom: 30px;
        left: 60px;
      }

      .logo img {
        width: 100px;
        height: auto;
      }
    </style>
  </head>
  <body>
    <div class="left-panel">
      <div class="problem-label">The Problem</div>
      <div class="left-title">{{ problem_title }}</div>
      <div class="left-body">{{ problem_body }}</div>
    </div>
    <div class="right-panel">
      <div class="solution-label">The Solution</div>
      <div class="right-title">{{ solution_title }}</div>
      <div class="right-body">{{ solution_body }}</div>
    </div>
    <div class="logo">
      <img src="{{ logo_url }}" alt="Logo" />
    </div>
  </body>
</html>
```

### Template Registry (JSON Config)

```json
{
  "templates": {
    "case_study_hero": {
      "file": "case_study_hero.html",
      "dimensions": [1200, 627],
      "fields": [
        "title",
        "subtitle",
        "cta",
        "screenshot_url",
        "logo_url",
        "background_color",
        "accent_color"
      ],
      "title_max_chars": 80,
      "subtitle_max_chars": 60,
      "cta_max_chars": 30
    },
    "big_stat_center": {
      "file": "big_stat_center.html",
      "dimensions": [1200, 627],
      "fields": [
        "stat_value",
        "stat_label",
        "subtitle",
        "logo_url",
        "source_label",
        "primary_color",
        "secondary_color"
      ],
      "stat_value_max_chars": 10,
      "stat_label_max_chars": 80,
      "subtitle_max_chars": 100
    },
    "problem_solution_split": {
      "file": "problem_solution_split.html",
      "dimensions": [1200, 627],
      "fields": [
        "problem_title",
        "problem_body",
        "solution_title",
        "solution_body",
        "logo_url",
        "primary_color"
      ],
      "problem_title_max_chars": 60,
      "problem_body_max_chars": 200,
      "solution_title_max_chars": 60,
      "solution_body_max_chars": 200
    },
    "doc_screenshot_left_text_right": {
      "file": "doc_screenshot_left_text_right.html",
      "dimensions": [1200, 627],
      "fields": ["title", "subtitle", "cta", "screenshot_url", "logo_url"],
      "title_max_chars": 80,
      "subtitle_max_chars": 100,
      "cta_max_chars": 30
    },
    "quote_card": {
      "file": "quote_card.html",
      "dimensions": [1200, 627],
      "fields": ["quote", "attribution", "logo_url", "background_color"],
      "quote_max_chars": 200,
      "attribution_max_chars": 60
    },
    "product_feature_highlight": {
      "file": "product_feature_highlight.html",
      "dimensions": [1200, 627],
      "fields": [
        "feature_name",
        "feature_description",
        "benefit_bullet_1",
        "benefit_bullet_2",
        "benefit_bullet_3",
        "screenshot_url",
        "logo_url"
      ],
      "feature_name_max_chars": 40,
      "feature_description_max_chars": 120
    },
    "announcement_card": {
      "file": "announcement_card.html",
      "dimensions": [1200, 627],
      "fields": ["headline", "body", "cta", "date", "logo_url"],
      "headline_max_chars": 60,
      "body_max_chars": 200
    }
  }
}
```

### Rendering Implementation

```python
from playwright.sync_api import sync_playwright
from jinja2 import Environment, FileSystemLoader
import boto3
import os

class TemplateRenderer:
    def __init__(self):
        self.jinja = Environment(loader=FileSystemLoader("templates/"))
        self.minio = boto3.client(
            's3',
            endpoint_url=os.getenv('MINIO_ENDPOINT'),
            aws_access_key_id=os.getenv('MINIO_ACCESS_KEY'),
            aws_secret_access_key=os.getenv('MINIO_SECRET_KEY')
        )
        self.bucket = os.getenv('MINIO_BUCKET')

    def render(self, template_id: str, fields: dict, output_path: str) -> str:
        # Load template
        template = self.jinja.get_template(f"{template_id}.html")
        html = template.render(**fields)

        # Render with Playwright
        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(
                viewport={'width': 1200, 'height': 627}
            )
            page.set_content(html)
            page.screenshot(path=output_path, type='png')
            browser.close()

        # Upload to MinIO
        minio_path = f"posts/{fields.get('post_id', 'temp')}/final.png"
        self.minio.upload_file(output_path, self.bucket, minio_path)

        return minio_path
```

### API Endpoints (Module 6)

#### `POST /api/v6/render`

**Request**:

```json
{
  "post_id": "post_abc123",
  "template_id": "case_study_hero",
  "fields": {
    "title": "COMPLEX DATA. FAST RESULTS. TOTAL CONFIDENCE.",
    "subtitle": "Financial Regulator transforms investigations",
    "cta": "READ CASE STUDY",
    "screenshot_url": "http://minio:9000/screenshots/doc_xxx/page_4.png",
    "logo_url": "http://minio:9000/brand/logo_white.png",
    "background_color": "#0052CC",
    "accent_color": "#00D4AA"
  }
}
```

**Response** `202 Accepted`:

```json
{
  "render_job_id": "render_job_123",
  "status": "processing"
}
```

#### `GET /api/v6/render/status/:render_job_id`

**Response**:

```json
{
  "render_job_id": "render_job_123",
  "status": "completed",
  "image_url": "http://minio:9000/posts/post_abc123/final.png",
  "dimensions": [1200, 627],
  "file_size_bytes": 245000
}
```

---

## 9. Module 5 + 6 Integration Flow

```
Module 4 Output (selected page with recommended_template)
    │
    ▼
Module 5: AI Content Generation
    │
    ├──► Fetch page data from PostgreSQL
    ├──► Fetch KG context from Neo4j (/api/v2/graph/context/:page_id)
    ├──► Fetch similar past posts from Chroma
    ├──► Fetch BrandRules from Neo4j
    ├──► Build LLM prompt with all context
    ├──► Call OpenAI/Claude (JSON mode)
    ├──► Validate output against template field limits
    ├──► Check brand compliance
    ├──► Save to `posts` table
    │
    ▼
Module 6: Template Rendering
    │
    ├──► Load template HTML by template_id
    ├──► Map post fields to template variables
    ├──► Download screenshot from MinIO → local path
    ├──► Download logo from MinIO → local path
    ├──► Inject all fields into Jinja2 template
    ├──► Playwright render → PNG
    ├──► Upload PNG to MinIO: posts/{post_id}/final.png
    ├──► Update posts table with image_url
    │
    ▼
Module 7: Multiple Options (next)
    • Regenerate with different hook_angle
    • Regenerate with different template
    • Regenerate with different tone
```

---

## 10. Docker Compose Addition

Add to existing `docker-compose.yml`:

```yaml
content-service:
  build: ./content-service
  ports:
    - "8004:8004"
  environment:
    - DATABASE_URL=postgresql://user:pass@postgres:5432/linkedin_automation
    - REDIS_URL=redis://redis:6379
    - MINIO_ENDPOINT=minio:9000
    - OPENAI_API_KEY=${OPENAI_API_KEY}
    - NEO4J_URI=bolt://neo4j:7687
    - NEO4J_USER=neo4j
    - NEO4J_PASSWORD=password123
    - CHROMA_URL=http://chroma:8000
  depends_on:
    - postgres
    - redis
    - minio
    - neo4j
    - chroma

render-service:
  build: ./render-service
  ports:
    - "8005:8005"
  environment:
    - MINIO_ENDPOINT=minio:9000
    - MINIO_ACCESS_KEY=minioadmin
    - MINIO_SECRET_KEY=minioadmin
    - MINIO_BUCKET=linkedin-automation
  depends_on:
    - minio
  deploy:
    resources:
      limits:
        memory: 2G # Playwright needs RAM
```

---

## 11. Environment Variables

### Content Service (Module 5)

```env
PORT=8004
DATABASE_URL=postgresql://user:pass@localhost:5432/linkedin_automation
REDIS_URL=redis://localhost:6379
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=linkedin-automation
OPENAI_API_KEY=sk-xxx
OPENAI_MODEL=gpt-4o
NEO4J_URI=bolt://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password123
CHROMA_URL=http://localhost:8000
PAST_POSTS_COLLECTION=company_documents
BRAND_PRIMARY_COLOR=#cb2eba
BRAND_SECONDARY_COLOR=#787496
BRAND_ACCENT_COLOR=#d8bfd8
```

### Render Service (Module 6)

```env
PORT=8005
MINIO_ENDPOINT=localhost:9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=linkedin-automation
TEMPLATES_DIR=./templates
DEFAULT_VIEWPORT_WIDTH=1200
DEFAULT_VIEWPORT_HEIGHT=627
```

---

## 12. File Structure

```
project/
├── docker-compose.yml
├── nodejs-api/                    # Module 1 (COMPLETE)
├── python-worker/                 # Module 1 (COMPLETE)
├── kg-service/                    # Module 2 (COMPLETE)
├── analysis-service/              # Module 3 (COMPLETE)
├── content-service/               # Module 5 (BUILD NOW)
│   ├── main.py
│   ├── generator/
│   │   ├── __init__.py
│   │   ├── prompt_builder.py      # Assembles LLM prompt
│   │   ├── llm_client.py          # OpenAI/Claude wrapper
│   │   ├── brand_checker.py       # Brand rule validation
│   │   └── post_validator.py      # Field length validation
│   ├── retriever/
│   │   ├── __init__.py
│   │   ├── kg_client.py           # Neo4j queries
│   │   ├── vector_client.py       # Chroma queries
│   │   └── past_post_retriever.py # Similar post search
│   ├── models/
│   │   └── schemas.py
│   ├── Dockerfile
│   └── requirements.txt
├── render-service/                # Module 6 (BUILD NOW)
│   ├── main.py
│   ├── renderer/
│   │   ├── __init__.py
│   │   ├── template_engine.py     # Jinja2 loader
│   │   ├── playwright_renderer.py # Screenshot generation
│   │   └── asset_fetcher.py       # MinIO download
│   ├── templates/                 # HTML template files
│   │   ├── case_study_hero.html
│   │   ├── big_stat_center.html
│   │   ├── problem_solution_split.html
│   │   ├── doc_screenshot_left_text_right.html
│   │   ├── quote_card.html
│   │   ├── product_feature_highlight.html
│   │   └── announcement_card.html
│   ├── models/
│   │   └── schemas.py
│   ├── Dockerfile
│   └── requirements.txt
└── shared/                        # Common models, utils
```

---

## 13. Constraints

1. **Module 5 must validate field lengths** against template limits before calling Module 6. If title is too long, truncate or regenerate.
2. **Module 6 must handle missing assets gracefully**. If screenshot fails to download, render with placeholder or return error.
3. **Playwright must run headless** in Docker. No GUI dependencies.
4. **Template HTML must be self-contained**. All CSS inline or via CDN. No external file dependencies except injected images.
5. **Brand colors must be injectable** as template variables. Do not hardcode in HTML.
6. **Module 5 and 6 can be called independently** but typically run sequentially via queue or orchestrator.
7. **All timestamps ISO 8601 UTC**.

---

## 14. Deliverables Checklist

### Module 5 (AI Content Generation)

- [ ] FastAPI service with endpoints: `POST /generate`, `GET /status`, `GET /posts`, `POST /regenerate`
- [ ] LLM prompt builder with KG context, past posts, brand rules
- [ ] Structured output validation (Instructor or JSON mode)
- [ ] Brand compliance checker (rule validation)
- [ ] PostgreSQL `posts` table with all columns
- [ ] Integration with Neo4j for graph context
- [ ] Integration with Chroma for past post retrieval
- [ ] Docker container working

### Module 6 (Template Rendering)

- [ ] FastAPI service with endpoints: `POST /render`, `GET /status`
- [ ] Jinja2 template engine loading from `templates/` directory
- [ ] 7 HTML templates: case_study_hero, big_stat_center, problem_solution_split, doc_screenshot_left_text_right, quote_card, product_feature_highlight, announcement_card
- [ ] Playwright renderer producing 1200x627 PNG
- [ ] MinIO upload for final images
- [ ] Asset fetching (screenshots, logos) from MinIO
- [ ] Docker container with Playwright + Chromium

### Integration

- [ ] End-to-end test: Upload PDF → Module 1 → Module 2 → Module 3 → Module 4 → Module 5 → Module 6 → View final PNG
- [ ] Verify Nuix-style case study hero template renders correctly
- [ ] Verify stat template renders correctly
- [ ] Verify brand colors inject properly

---

## 15. gstack Workflow

1. Save this file as `CLAUDE.md` in project root
2. Run `/office-hours` or `/spec` to align
3. Run `/plan-eng-review` to lock architecture
4. Build Module 5 (content-service) and Module 6 (render-service) using `/codex`
5. Run `/review` for staff engineer pass
6. Run `/qa`: Upload test PDF, verify selected pages, verify posts generated, verify PNG renders, verify template matches content type

---

**Current Task: Build Module 5 (AI Content Generation) and Module 6 (Template Rendering) together. Module 4 is a pass-through lookup table — verify it exists, build if missing.**

**Execute exactly. Do not substitute tools. Report blockers immediately.**
