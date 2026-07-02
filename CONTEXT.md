# LinkedIn Post Automation

This context describes the language used for generating and rendering branded LinkedIn post images from document pages.

## Language

**Brand Config**:
A checked-in JSON file that defines the active visual and voice rules for generated posts. It is the source of truth for fixed brand choices.
_Avoid_: Brand env vars, BrandRule nodes

**Brand Constants**:
The fixed values from Brand Config, such as colors, font, logo, and button style. They are resolved at render time rather than stored on each post.
_Avoid_: Template fields, post fields

**Template Fields**:
The post-specific content passed to a render template, such as title, subtitle, CTA text, bullets, and screenshot path.
_Avoid_: Brand constants

**Brand Voice Rules**:
The writing constraints from Brand Config that guide generated captions and template copy.
_Avoid_: Hardcoded prompt rules

**Brand Compliance Metadata**:
The record of which Brand Voice Rules were considered for a generated post. It is not an enforcement result unless violations are explicitly populated.
_Avoid_: Brand enforcement, compliance engine
