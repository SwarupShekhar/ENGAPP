from app.tasks.celery_app import celery_app
from app.tasks.analysis_tasks import analyze_async
from celery import group
from typing import List, Dict, Any

@celery_app.task(name="app.tasks.analyze_batch")
def analyze_batch(requests: List[dict]):
    """
    Background task for batch text analysis using a group.
    """
    job = group(analyze_async.s(req) for req in requests)
    result = job.apply_async()
    return result.id
