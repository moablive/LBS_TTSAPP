FROM python:3.11-slim

WORKDIR /app

# Camada de deps separada do código: mexer no src não reinstala tudo.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY src ./src

# tmp/ = mp3 efêmero. data/ = preferências (montado como volume no compose).
RUN mkdir -p tmp data

ENV PYTHONUNBUFFERED=1 \
    TMP_DIR=/app/tmp \
    DATA_DIR=/app/data

# -m e não "python src/main.py": o pacote usa imports relativos (from . import).
CMD ["python", "-m", "src.main"]
