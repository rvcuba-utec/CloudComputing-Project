FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY src ./src

RUN addgroup -S cloudshop && adduser -S cloudshop -G cloudshop
USER cloudshop

EXPOSE 8002

CMD ["node", "src/index.js"]
