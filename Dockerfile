FROM python:3.11-slim
WORKDIR /app
COPY . /app
# Usa PORT fornita dalla piattaforma (default 8000)
ENV PORT=8000
EXPOSE 8000
CMD ["python", "server.py"]