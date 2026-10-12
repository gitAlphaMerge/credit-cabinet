FROM python:3.11-slim
WORKDIR /app
COPY services/ml-model/*.py ./
COPY data/synthetic/*.csv data/synthetic/reference.py ./fixtures/
ENV FIXTURES_DIR=/app/fixtures JOURNAL_PATH=/app/journal/decisions.jsonl PYTHONIOENCODING=utf-8
EXPOSE 5000
CMD ["python", "-u", "app.py"]
