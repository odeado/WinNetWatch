FROM node:22-alpine

RUN apk add --no-cache iputils busybox-extras bind-tools
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY src ./src
EXPOSE 8080
CMD ["npm", "start"]
