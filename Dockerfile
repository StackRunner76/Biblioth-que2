# Étape 1 : tests + construction du site statique
FROM node:22-alpine AS build
WORKDIR /app
COPY . .
RUN node --test "packages/core/test/**/*.test.js" && node scripts/build.mjs

# Étape 2 : service par nginx
FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ >/dev/null || exit 1
