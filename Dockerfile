FROM node:17-bullseye as builder
WORKDIR /code
COPY . .
RUN  npm install -g typescript \
    && npm install \
    && npm run build

FROM node:17-slim
WORKDIR /app
COPY --from=builder /code/node_modules ./node_modules
COPY --from=builder /code/dist ./dist
COPY --from=builder /code/config.json ./config.json

ENV AUTO_INCLUSTER_CONFIG="true"
CMD [ "node", "dist/main.js" ]