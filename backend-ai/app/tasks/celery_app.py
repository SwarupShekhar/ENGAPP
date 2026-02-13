from celery import Celery
from app.core.config import settings

celery_app = Celery(
    "englivo-ai",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=[
        "app.tasks.transcription_tasks",
        "app.tasks.analysis_tasks",
        "app.tasks.batch_tasks"
    ]
)

celery_app.conf.update(
    task_track_started=settings.celery_task_track_started,
    task_time_limit=settings.celery_task_time_limit,
    worker_prefetch_multiplier=1,
    task_acks_late=True,
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

if __name__ == "__main__":
    celery_app.start()
