# Build from the repository root (the backend uses ../shared):
#   docker build -f backend/Dockerfile -t polaris-backend .
#   docker run -p 8787:8787 -v polaris-data:/app/backend/data --env-file backend/.env polaris-backend
FROM node:22-slim
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY shared /app/shared
COPY backend /app/backend
RUN rm -rf /app/backend/data && mkdir -p /app/backend/data && chown node:node /app/backend/data
ENV POLARIS_HOST=0.0.0.0 POLARIS_PORT=8787 NODE_ENV=production
VOLUME /app/backend/data
EXPOSE 8787
USER node
CMD ["node", "--disable-warning=ExperimentalWarning", "server.js"]
