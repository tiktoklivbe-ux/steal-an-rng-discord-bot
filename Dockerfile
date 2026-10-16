FROM node:24-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod
COPY --chown=node:node . .
RUN mkdir -p data && chown node:node data
USER node
CMD ["npm", "start"]
