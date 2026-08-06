FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm install
COPY src ./src
RUN npm run build

FROM node:20-alpine

WORKDIR /app
RUN apk add --no-cache python3 py3-pip ffmpeg && \
    python3 -m venv /opt/venv && \
    /opt/venv/bin/pip install --no-cache-dir edge-tts

ENV PATH="/opt/venv/bin:$PATH"

COPY package*.json ./
RUN npm install --only=production
COPY --from=builder /app/dist ./dist

EXPOSE 3000
CMD ["node", "dist/server.js"]
