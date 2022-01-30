FROM node:16.13.2-alpine3.15
WORKDIR /app
COPY . .
RUN npm install -g typescript \
    && npm install \
    && npm run build
ENV AUTO_INCLUSTER_CONFIG="true"
CMD [ "node", "dist/main.js" ]
