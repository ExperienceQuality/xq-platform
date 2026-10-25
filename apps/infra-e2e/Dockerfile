FROM node:24-alpine
WORKDIR /app
COPY container/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund
COPY dist/services.js ./services.js
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "services.js"]
