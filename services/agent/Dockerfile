FROM python:3.11-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 AGENT_LOG=/app/var/agent.log
COPY server.py dialog.py core_http.py explain_templates.py guard.py intake_rules.py llm.py memory.py AGENT.md PERMISSIONS.md MEMORY.md ./
RUN mkdir -p /app/var
CMD ["python", "server.py"]
