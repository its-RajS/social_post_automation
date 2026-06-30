import os
import logging
from typing import Optional

from neo4j import GraphDatabase

logger = logging.getLogger(__name__)

NEO4J_URL = os.environ.get('NEO4J_URL', 'bolt://localhost:7687')
NEO4J_USER = os.environ.get('NEO4J_USER', 'neo4j')
NEO4J_PASSWORD = os.environ.get('NEO4J_PASSWORD', 'password123')

_driver = None

POST_THEMES = [
    {'name': 'Product Education', 'description': 'Teach how product works', 'template_types': ['doc_screenshot_left_text_right', 'product_education']},
    {'name': 'Insight', 'description': 'Share a business insight or opinion', 'template_types': ['insight_quote', 'big_text_center']},
    {'name': 'Stat', 'description': 'Highlight a key statistic', 'template_types': ['big_stat_center', 'stat_with_context']},
    {'name': 'Problem Solution', 'description': 'Problem + solution narrative', 'template_types': ['problem_solution_split']},
    {'name': 'Case Study', 'description': 'Customer result or success story', 'template_types': ['case_study_card']},
    {'name': 'Quote', 'description': 'Testimonial or strong opinion quote', 'template_types': ['quote_card']},
    {'name': 'Announcement', 'description': 'New product, feature, or event', 'template_types': ['announcement_banner']},
    {'name': 'Carousel', 'description': 'Multi-slide document post', 'template_types': ['carousel']},
]

BRAND_RULES = [
    {'rule_type': 'color', 'description': 'Primary brand color #cb2eba', 'priority': 1},
    {'rule_type': 'color', 'description': 'Secondary brand color #787496', 'priority': 2},
    {'rule_type': 'color', 'description': 'Accent color #d8bfd8', 'priority': 3},
    {'rule_type': 'tone', 'description': 'Professional but approachable tone', 'priority': 1},
    {'rule_type': 'avoid', 'description': 'No confidential or legal content', 'priority': 1},
]


def _get_driver():
    global _driver
    if _driver is None:
        _driver = GraphDatabase.driver(NEO4J_URL, auth=(NEO4J_USER, NEO4J_PASSWORD))
    return _driver


def create_indexes():
    driver = _get_driver()
    with driver.session() as session:
        for label, prop in [('Document', 'doc_id'), ('Page', 'page_id'),
                            ('Company', 'name'), ('Product', 'name'), ('Service', 'name'),
                            ('Feature', 'name'), ('Audience', 'name'), ('PainPoint', 'name'),
                            ('Benefit', 'name'), ('UseCase', 'name'), ('Industry', 'name')]:
            session.run(f'CREATE INDEX {label.lower()}_{prop}_idx IF NOT EXISTS FOR (n:{label}) ON (n.{prop})')


def seed_static_nodes():
    create_indexes()
    driver = _get_driver()
    with driver.session() as session:
        for theme in POST_THEMES:
            session.run(
                'MERGE (t:PostTheme {name: $name}) SET t.description = $description, t.template_types = $template_types',
                **theme
            )
        for rule in BRAND_RULES:
            session.run(
                'MERGE (r:BrandRule {rule_type: $rule_type, description: $description}) SET r.priority = $priority',
                **rule
            )


def upsert_document_node(doc_id: str, filename: str, mime_type: str):
    driver = _get_driver()
    with driver.session() as session:
        session.run(
            'MERGE (d:Document {doc_id: $doc_id}) SET d.filename = $filename, d.mime_type = $mime_type',
            doc_id=doc_id, filename=filename, mime_type=mime_type
        )


def upsert_page_node(page_id: str, doc_id: str, page_number: int, text_preview: str, screenshot_url: Optional[str]):
    driver = _get_driver()
    with driver.session() as session:
        session.run(
            '''
            MERGE (p:Page {page_id: $page_id})
            SET p.page_number = $page_number,
                p.text_preview = $text_preview,
                p.screenshot_url = $screenshot_url
            WITH p
            MATCH (d:Document {doc_id: $doc_id})
            MERGE (d)-[:CONTAINS]->(p)
            MERGE (p)-[:BELONGS_TO]->(d)
            ''',
            page_id=page_id, doc_id=doc_id, page_number=page_number,
            text_preview=text_preview, screenshot_url=screenshot_url
        )


def write_entities_and_relationships(page_id: str, entities: list[dict], relationships: list[dict]):
    driver = _get_driver()
    with driver.session() as session:
        # Create entity nodes
        for entity in entities:
            label = entity.get('label', 'Entity')
            name = entity.get('name', '')
            props = entity.get('properties', {})
            if not name:
                continue
            # Only allow known labels for safety
            if label not in ('Company', 'Product', 'Service', 'Feature', 'Audience',
                             'PainPoint', 'Benefit', 'UseCase', 'Industry'):
                label = 'Entity'
            session.run(
                f'MERGE (n:{label} {{name: $name}}) SET n += $props',
                name=name, props={k: v for k, v in props.items() if isinstance(v, (str, int, float, bool))}
            )
            # Link page → entity
            session.run(
                f'MATCH (p:Page {{page_id: $page_id}}), (n:{label} {{name: $name}}) MERGE (p)-[:MENTIONS]->(n)',
                page_id=page_id, name=name
            )

        # Create relationships between entities
        ALLOWED_RELS = {'OFFERS', 'HAS_FEATURE', 'SOLVES', 'AFFECTS', 'PROVIDES',
                        'HAS_USE_CASE', 'TARGETS', 'SERVES', 'FITS', 'RELATES_TO'}
        for rel in relationships:
            from_name = rel.get('from', '')
            to_name = rel.get('to', '')
            rel_type = rel.get('type', '').upper()
            if not (from_name and to_name and rel_type in ALLOWED_RELS):
                continue
            session.run(
                f'MATCH (a {{name: $from_name}}), (b {{name: $to_name}}) MERGE (a)-[:{rel_type}]->(b)',
                from_name=from_name, to_name=to_name
            )


def get_entities_for_doc(doc_id: str) -> list[dict]:
    driver = _get_driver()
    with driver.session() as session:
        result = session.run(
            '''
            MATCH (d:Document {doc_id: $doc_id})-[:CONTAINS]->(p:Page)-[:MENTIONS]->(e)
            RETURN labels(e) AS labels, e.name AS name, properties(e) AS props
            ''',
            doc_id=doc_id
        )
        return [{'labels': r['labels'], 'name': r['name'], 'properties': dict(r['props'])} for r in result]


def get_context_for_page(page_id: str) -> dict:
    driver = _get_driver()
    with driver.session() as session:
        result = session.run(
            '''
            MATCH (p:Page {page_id: $page_id})-[:MENTIONS]->(e)
            RETURN labels(e) AS labels, e.name AS name
            ''',
            page_id=page_id
        )
        entities = [{'labels': r['labels'], 'name': r['name']} for r in result]
        products = [e['name'] for e in entities if 'Product' in e['labels']]
        audiences = [e['name'] for e in entities if 'Audience' in e['labels']]
        pain_points = [e['name'] for e in entities if 'PainPoint' in e['labels']]
        return {
            'product_relevance': min(1.0, len(products) * 0.3),
            'audience': audiences,
            'pain_points': pain_points,
            'entities': entities,
        }


def close():
    global _driver
    if _driver:
        _driver.close()
        _driver = None
