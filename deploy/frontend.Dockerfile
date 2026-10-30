FROM docker.io/library/node:24.22.1-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
RUN npm ci --no-audit --no-fund
COPY frontend/ ./frontend/
RUN npm run build
ARG SOURCE_COMMIT=unknown
RUN node -e 'require("fs").writeFileSync("frontend/dist/version.json", JSON.stringify({commit:process.argv[1]}))' "$SOURCE_COMMIT"

FROM docker.io/nginxinc/nginx-unprivileged:1.30.6-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/health || exit 1
