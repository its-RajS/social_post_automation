FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-dev \
    libreoffice \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-eng \
    fonts-liberation \
    libglib2.0-0 libsm6 libxext6 libxrender-dev \
    wget curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install CPU-only torch BEFORE copying requirements.txt so this layer
# stays cached even when requirements.txt changes
RUN pip3 install --no-cache-dir --timeout=300 --retries=5 \
    torch==2.4.0+cpu torchvision==0.19.0+cpu \
    --index-url https://download.pytorch.org/whl/cpu

COPY requirements.txt .
RUN pip3 install --no-cache-dir --timeout=300 --retries=5 -r requirements.txt

# Install Playwright Chromium
RUN python3 -m playwright install --with-deps chromium

# Pre-download Docling models to bake into image (avoids cold-start download)
RUN python3 -c "from docling.document_converter import DocumentConverter; DocumentConverter()" || true

COPY . .

EXPOSE 8001
CMD ["python3", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8001"]
