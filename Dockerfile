FROM node:24.22.0-bookworm-slim AS base
WORKDIR /app
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
COPY package.json package-lock.json ./
RUN npm ci && npx playwright install --with-deps chromium && chmod -R a+rX /ms-playwright

FROM base AS dev
COPY --chown=node:node . .
RUN chown -R node:node /app
USER node
EXPOSE 3000
CMD ["./node_modules/.bin/astro", "dev", "--host", "0.0.0.0", "--port", "3000"]

FROM dev AS build
RUN npm test && npm run test:browser && npm run check && npm run build
RUN npm prune --omit=dev

FROM base AS prod
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
COPY --from=build --chown=node:node /app/dist ./dist
RUN rm -rf node_modules
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/src/lib ./src/lib
COPY --from=build --chown=node:node /app/scripts/backend-probe.ts ./scripts/backend-probe.ts
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "dist/server/entry.mjs"]
