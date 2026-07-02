# Brand Config File as Source of Truth

We use a checked-in `brand/brand.json` file as the current source of truth for brand colors, font, logo, button style, and voice rules. This replaces scattered env vars, hardcoded prompt text, template fallbacks, and unused Neo4j `BrandRule` seeds because the brand is read by both content generation and rendering but is not yet editable through an admin UI.
