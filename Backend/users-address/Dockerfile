# Microservicio de Usuarios (FastAPI + PostgreSQL)
FROM python:3.12-slim

# Sin .pyc y logs sin buffer (mejor para contenedores)
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# curl para el healthcheck + usuario no-root
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && addgroup --system cloudshop \
    && adduser --system --ingroup cloudshop cloudshop

# Dependencias primero (aprovecha la caché de Docker)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Código de la app
COPY app ./app
RUN chown -R cloudshop:cloudshop /app

USER cloudshop

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
