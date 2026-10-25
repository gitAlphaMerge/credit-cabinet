FROM python:3.11-slim
WORKDIR /app/services/ml-model
COPY services/ml-model/*.py ./
COPY data/catalog/ /app/data/catalog/
COPY data/synthetic/*.csv data/synthetic/reference.py /app/data/synthetic/
ENV FIXTURES_DIR=/app/data/synthetic JOURNAL_PATH=/app/journal/decisions.jsonl PYTHONIOENCODING=utf-8
EXPOSE 5000
CMD ["python", "-u", "app.py"]
