# syntax=docker/dockerfile:1.7
# Fly.io image for the Miravelo mock upstream. Standalone install (no
# workspace): the package pins exact dependency versions, and the private
# @miragon registry needs GITHUB_TOKEN — passed as a BuildKit secret, same as
# the root Dockerfile. Deployed via playground/fly/deploy.sh.
FROM node:26-slim@sha256:a1d9d671994fc2d26e297ac56b4b1522a8bc7fa71c43b14cd1b1fe6c5116f7dc

RUN npm install -g pnpm@10.32.1
ENV CI=true

WORKDIR /app

COPY package.json .npmrc ./
RUN --mount=type=secret,id=github_token \
    GITHUB_TOKEN=$(cat /run/secrets/github_token) pnpm install

COPY tsconfig.json server.ts data.ts ./
COPY widget/ widget/
RUN pnpm run build:widget

ENV NODE_ENV=production
EXPOSE 8401

USER node

CMD ["pnpm", "exec", "tsx", "server.ts"]
