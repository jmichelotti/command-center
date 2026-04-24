FROM node:24-slim AS frontend
WORKDIR /build
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir fastapi uvicorn pyyaml httpx python-multipart
COPY backend/ ./backend/
COPY config/ ./config/
COPY assets/ ./assets/
COPY writers/ ./writers/
COPY --from=frontend /build/dist ./frontend/dist
EXPOSE 8200
CMD ["python", "-m", "uvicorn", "backend.app:app", "--host", "0.0.0.0", "--port", "8200"]
