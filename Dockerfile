FROM node:24-alpine3.22
RUN apk add --no-cache postgresql17-client
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY server ./server
COPY shared ./shared
COPY public ./public
COPY scripts ./scripts
RUN npm run build && mkdir -p /app/data/backups && chown -R node:node /app
USER node
ENV NODE_ENV=production HOST=0.0.0.0 PORT=6400 BACKUP_DIR=/app/data/backups
EXPOSE 6400
CMD ["node", "server.js"]
