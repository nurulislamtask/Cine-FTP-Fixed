# CineFTP - production image WITH ffmpeg (this is what makes MKV/HEVC files play)
FROM node:20-bookworm-slim

# ffmpeg + ffprobe: required for /api/transcode (MKV -> MP4 remux) and /api/probe.
# Vercel serverless has NO ffmpeg - that is why playback fails there but works in AI Studio.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install --legacy-peer-deps
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["npx", "tsx", "server.ts"]
