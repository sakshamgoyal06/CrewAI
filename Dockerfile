# Production image: build with `docker build -t magnus .` from repo root.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
COPY .cursor/skills/health/references ./.cursor/skills/health/references
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/.cursor/skills/health/references ./.cursor/skills/health/references
EXPOSE 8080
# Pass env at runtime (compose env_file, k8s secrets, etc.); do not bake secrets into the image.
CMD ["node", "dist/index.js"]
