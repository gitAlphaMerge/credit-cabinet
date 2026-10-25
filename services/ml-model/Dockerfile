FROM python:3.11-slim
# core.py читает каталог как parents[2]/data/catalog: раскладка повторяет репо
WORKDIR /app/services/ml-model
COPY services/ml-model/*.py ./
COPY data/catalog/products.json /app/data/catalog/products.json
COPY data/synthetic/*.csv data/synthetic/reference.py /app/fixtures/
ENV FIXTURES_DIR=/app/fixtures JOURNAL_PATH=/app/journal/decisions.jsonl PYTHONIOENCODING=utf-8
EXPOSE 5000
CMD ["python", "-u", "app.py"]
