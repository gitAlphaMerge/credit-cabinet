FROM node:24.0.0-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run fixtures && npm run build
ENV HOST=0.0.0.0 PORT=4173
EXPOSE 4173
CMD ["npm", "start"]
