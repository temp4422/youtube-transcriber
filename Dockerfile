FROM node:24.22.0-bookworm-slim AS base
WORKDIR /app

FROM base AS dev
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM dev AS build
RUN npm test && npm run check && npm run build
RUN npm prune --omit=dev

FROM base AS prod
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/src/lib ./src/lib
COPY --from=build --chown=node:node /app/scripts/backend-probe.ts ./scripts/backend-probe.ts
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server/entry.mjs"]

# Optional diagnostic only; not part of the running web app.
FROM base AS ytdlp-probe
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv ca-certificates && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/ytdlp && /opt/ytdlp/bin/pip install --no-cache-dir 'yt-dlp[default]==2026.10.26'
ENV PATH="/opt/ytdlp/bin:$PATH"
COPY --chown=node:node scripts/ytdlp-probe.py /app/scripts/ytdlp-probe.py
USER node
ENTRYPOINT ["python3", "/app/scripts/ytdlp-probe.py"]

FROM ytdlp-probe AS ytdlp-pot-probe
USER root
RUN /opt/ytdlp/bin/pip install --no-cache-dir 'bgutil-ytdlp-pot-provider==2.0.2'
USER node
