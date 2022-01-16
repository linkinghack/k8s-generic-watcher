FROM artifactory.dep.devops.cmit.cloud:20101/docker/node:16.13.2-buster
WORKDIR /app
ADD . .
RUN  npm config set registry https://artifactory.dep.devops.cmit.cloud:20101/artifactory/api/npm/npm/ \
    && npm install -g typescript \
    && npm install \
    && npm run build
CMD [ "node", "dist/main.js" ]
